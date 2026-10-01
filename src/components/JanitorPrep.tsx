import { AlertTriangle, Check, ClipboardCopy, Copy, Lightbulb, X, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { CharacterCard } from '../lib/parser';
import {
  type CardIssue,
  type JanitorField,
  janitorFieldsAsText,
  janitorTokenBreakdown,
  lintCard,
  toJanitorFields,
} from '../lib/janitor';
import { cn } from '../lib/utils';
import type { BioSlotRequest } from '../lib/api';
import { BioTemplateFiller } from './BioTemplateFiller';
import { Textarea } from './ui/textarea';

const BUDGET_KEY = 'st_janitor_token_budget';
const DEFAULT_BUDGET = 2000;

function readBudget(fallback: number): number {
  try {
    const n = parseInt(localStorage.getItem(BUDGET_KEY) || '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Stacked-bar colours for the permanent fields, in render order. */
const SEGMENTS: { key: JanitorField['key']; label: string; className: string }[] = [
  { key: 'personality', label: 'Personality', className: 'bg-primary-solid' },
  { key: 'scenario', label: 'Scenario', className: 'bg-amber-500' },
  { key: 'exampleDialogs', label: 'Examples', className: 'bg-emerald-500' },
];

const SEVERITY = {
  error: { icon: XCircle, tone: 'text-destructive', label: 'Must fix' },
  warning: { icon: AlertTriangle, tone: 'text-amber-600', label: 'Worth a look' },
  tip: { icon: Lightbulb, tone: 'text-slate-400', label: 'Tip' },
} as const;

interface Props {
  card: CharacterCard;
  onChange: (card: CharacterCard) => void;
  notify: (message: string, variant?: 'error' | 'success' | 'info') => void;
  /** The Forge's own token limit, used as the starting target when set. */
  suggestedBudget?: number;
  /** Writes coded-bio slots with the Forge's AI. Omit to hide the template filler. */
  onFillBioSlots?: (slots: BioSlotRequest[]) => Promise<string[]>;
}

export function JanitorPrep({ card, onChange, notify, suggestedBudget, onFillBioSlots }: Props) {
  const [budget, setBudget] = useState(() => readBudget(suggestedBudget || DEFAULT_BUDGET));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const fields = useMemo(() => toJanitorFields(card), [card]);
  const tokens = useMemo(() => janitorTokenBreakdown(card), [card]);
  const issues = useMemo(() => lintCard(card, budget), [card, budget]);
  const tags = card.tags || [];

  const counts = {
    error: issues.filter((i) => i.severity === 'error').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    tip: issues.filter((i) => i.severity === 'tip').length,
  };

  const ratio = budget > 0 ? tokens.permanent / budget : 0;
  const meterTone = ratio > 1 ? 'text-destructive' : ratio > 0.8 ? 'text-amber-600' : 'text-emerald-600';

  const updateBudget = (value: string) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setBudget(n);
    try {
      localStorage.setItem(BUDGET_KEY, String(n));
    } catch {
      /* preference only */
    }
  };

  const copy = async (key: string, text: string, label: string) => {
    if (!text) return;
    if (await copyText(text)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    } else {
      notify(`Could not copy ${label}. Your browser blocked clipboard access.`, 'error');
    }
  };

  const jumpTo = (issue: CardIssue) => {
    const el = document.getElementById(`janitor-field-${issue.field === 'card' ? 'personality' : issue.field}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('ring-2', 'ring-primary/40');
    setTimeout(() => el?.classList.remove('ring-2', 'ring-primary/40'), 1400);
  };

  const addTags = (raw: string) => {
    const incoming = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const merged = [...tags];
    for (const t of incoming) {
      if (!merged.some((m) => m.toLowerCase() === t.toLowerCase())) merged.push(t);
    }
    if (merged.length !== tags.length) onChange({ ...card, tags: merged });
    setTagDraft('');
  };

  return (
    <div className="space-y-6">
      {/* Token budget */}
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Permanent tokens</p>
            <p className="mt-1 font-serif text-4xl font-light tabular-nums text-slate-900">
              <span className={meterTone}>≈{tokens.permanent.toLocaleString()}</span>
              <span className="text-xl text-slate-400"> {budget > 0 ? `/ ${budget.toLocaleString()}` : 'no target'}</span>
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              Personality, scenario and example dialogs are re-sent with every message. The initial
              message adds ≈{tokens.temporary.toLocaleString()} temporary tokens that scroll out over time.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Target
            <input
              type="number"
              min={0}
              step={100}
              value={budget || ''}
              placeholder="none"
              onChange={(e) => updateBudget(e.target.value)}
              className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
        </div>

        <div
          className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={budget > 0 ? `${tokens.permanent} of ${budget} permanent tokens used` : `${tokens.permanent} permanent tokens`}
        >
          {SEGMENTS.map((s) => {
            // Scale to the target, or to the total once it overflows (or has no target).
            const share = (tokens.byField[s.key] / Math.max(budget, tokens.permanent, 1)) * 100;
            return share > 0 ? (
              <div key={s.key} className={cn('h-full transition-all duration-500', s.className)} style={{ width: `${share}%` }} />
            ) : null;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', s.className)} />
              {s.label} <span className="tabular-nums text-slate-400">≈{tokens.byField[s.key]}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Estimated at four characters per token. Real counts vary by model.
        </p>
      </section>

      {/* Checklist */}
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-serif text-xl font-medium text-slate-900">Pre-publish checks</h4>
          <div className="flex gap-2 text-xs">
            {(['error', 'warning', 'tip'] as const).map((s) => (
              <span key={s} className={cn('rounded-full border border-border px-2.5 py-0.5 tabular-nums', counts[s] ? SEVERITY[s].tone : 'text-slate-400')}>
                {counts[s]} {SEVERITY[s].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        {counts.error + counts.warning === 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            Ready to publish. {counts.tip ? 'A few optional tips below.' : ''}
          </div>
        )}

        <ul className="space-y-1.5">
          {issues.map((issue) => {
            const { icon: Icon, tone } = SEVERITY[issue.severity];
            return (
              <li key={issue.id}>
                <button
                  onClick={() => jumpTo(issue)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-muted"
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} strokeWidth={2.25} />
                  <span className="leading-relaxed">{issue.message}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {onFillBioSlots && (
        <BioTemplateFiller
          cardName={card.name}
          currentBio={card.creator_notes || ''}
          onFill={onFillBioSlots}
          onApply={(html) => onChange({ ...card, creator_notes: html })}
          notify={notify}
        />
      )}

      {/* Copy-out */}
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-serif text-xl font-medium text-slate-900">JanitorAI fields</h4>
          <button
            onClick={() => copy('__all', janitorFieldsAsText(card), 'the card')}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-muted hover:text-primary"
          >
            {copiedKey === '__all' ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {copiedKey === '__all' ? 'Copied' : 'Copy all as text'}
          </button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-slate-500">
          In the order JanitorAI's creator asks for them. Copy each into its matching box.
        </p>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} id={`janitor-field-${f.key}`} className="rounded-xl border border-border bg-background p-4 transition-shadow">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{f.label}</span>
                  {f.key !== 'name' && f.key !== 'bio' && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        f.permanent ? 'bg-primary/10 text-primary' : 'bg-muted text-slate-500'
                      )}
                    >
                      {f.permanent ? 'Permanent' : 'Temporary'} · ≈{tokens.byField[f.key]}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => copy(f.key, f.value, f.label)}
                  disabled={!f.value}
                  aria-label={`Copy ${f.label}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  {copiedKey === f.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === f.key ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mb-2 text-[11px] text-slate-400">{f.hint}</p>

              {f.key === 'bio' ? (
                <Textarea
                  value={card.creator_notes || ''}
                  onChange={(e) => onChange({ ...card, creator_notes: e.target.value })}
                  spellCheck={!(card.creator_notes || '').trimStart().startsWith('<')}
                  placeholder="What a browser sees before starting a chat: the hook, the setting, any content notes."
                  className={cn('min-h-[90px] bg-card text-sm', (card.creator_notes || '').trimStart().startsWith('<') && 'font-mono text-xs')}
                />
              ) : f.value ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">
                  {f.value}
                </pre>
              ) : (
                <p className="text-sm italic text-slate-400">Empty</p>
              )}
            </div>
          ))}

          {/* Tags */}
          <div id="janitor-field-tags" className="rounded-xl border border-border bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Tags</span>
              <button
                onClick={() => copy('tags', tags.join(', '), 'tags')}
                disabled={!tags.length}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-40"
              >
                {copiedKey === 'tags' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey === 'tags' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
                  {t}
                  <button
                    onClick={() => onChange({ ...card, tags: tags.filter((x) => x !== t) })}
                    aria-label={`Remove tag ${t}`}
                    className="rounded-full p-0.5 text-slate-400 hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTags(tagDraft);
                  } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                    onChange({ ...card, tags: tags.slice(0, -1) });
                  }
                }}
                onBlur={() => tagDraft.trim() && addTags(tagDraft)}
                placeholder={tags.length ? 'Add another…' : 'Male, Slow Burn, Fantasy…'}
                className="min-w-[10rem] flex-1 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
