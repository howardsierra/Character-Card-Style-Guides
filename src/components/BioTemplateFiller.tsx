import { Check, Code2, Copy, Eye, FileUp, Loader2, Moon, Pencil, Sun, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BioSlotRequest } from '../lib/api';
import { detectBioSlots, extractTextBlocks, fillBioTemplate, fillTextBlocks } from '../lib/bioTemplate';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const TEMPLATE_KEY = 'st_bio_template';
/** Filled values and tick changes, so work survives a reload before it is applied. */
const STATE_KEY = 'st_bio_template_state';
const MAX_TEMPLATE_BYTES = 300_000;

/**
 * Stand-in page colours for the preview. JanitorAI is dark by default, and many
 * coded bios lean on the page behind them. :where() keeps this at zero
 * specificity so the template's own styles always win.
 */
const PREVIEW_PAGE = {
  dark: '<style>:where(html){color-scheme:dark;background:#18181b;color:#e4e4e7;font-family:system-ui,sans-serif}</style>',
  light: '<style>:where(html){color-scheme:light;background:#ffffff;color:#18181b;font-family:system-ui,sans-serif}</style>',
};

/** JanitorAI's hashed CSS-module class names, e.g. "_pageTitle_4cue2_65". Only styled on JanitorAI itself. */
const JANITOR_CLASSES = /class="[^"]*\b_[A-Za-z0-9]+_[a-z0-9]{5}_\d+/;

type Mode = 'markers' | 'text';

/** One fillable spot, whichever way the template marks it. */
interface Item {
  id: string;
  label: string;
  /** Placeholder as written ({{tagline}}), shown for marker templates. */
  token?: string;
  /** Filler being replaced, for sample-text templates. */
  current?: string;
  kind: 'text' | 'asset';
  occurrences: number;
  context: string;
  group?: number;
  defaultOn: boolean;
  long: boolean;
}

interface Persisted {
  values: Record<string, string>;
  flipped: string[];
}

function load(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function save(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage full or blocked: everything still works for this session */
  }
}

function loadState(): Persisted {
  try {
    const parsed = JSON.parse(load(STATE_KEY) || '{}');
    return {
      values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
      flipped: Array.isArray(parsed.flipped) ? parsed.flipped : [],
    };
  } catch {
    return { values: {}, flipped: [] };
  }
}

/** The few words either side of the spot, so the snippet stays centred on it when truncated. */
function nearby(context: string, reach = 48): string {
  const [before = '', after = ''] = context.split('___');
  const b = before.trimEnd();
  const a = after.trimStart();
  return `${b.length > reach ? '…' + b.slice(-reach) : b} ___ ${a.length > reach ? a.slice(0, reach) + '…' : a}`.trim();
}

const LONG_NAME = /\b(backstory|story|history|description|bio|about|summary|intro|lore|personality|scenario|note|paragraph)\b/i;

interface Props {
  /** Card name, used only for placeholder text. */
  cardName: string;
  /** Asks the model for one value per slot, in order. */
  onFill: (slots: BioSlotRequest[]) => Promise<string[]>;
  /** Commit the finished HTML as the card's bio. */
  onApply: (html: string) => void;
  currentBio: string;
  notify: (message: string, variant?: 'error' | 'success' | 'info') => void;
}

export function BioTemplateFiller({ cardName, onFill, onApply, currentBio, notify }: Props) {
  const [template, setTemplate] = useState(() => load(TEMPLATE_KEY));
  const [values, setValues] = useState<Record<string, string>>(() => loadState().values);
  // Items whose tick differs from their default. Storing the difference, not the
  // set, keeps defaults (filler pre-ticked, credits not) working on new templates.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set(loadState().flipped));
  const [modeOverride, setModeOverride] = useState<Mode | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<'preview' | 'html'>('preview');
  const [previewDark, setPreviewDark] = useState(true);
  const [editingSource, setEditingSource] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const markers = useMemo(() => detectBioSlots(template), [template]);
  const blocks = useMemo(() => extractTextBlocks(template), [template]);
  // Templates with explicit placeholders mean exactly those; otherwise work on the filler text.
  const autoMode: Mode = markers.length ? 'markers' : 'text';
  const mode = modeOverride ?? autoMode;

  const items: Item[] = useMemo(
    () =>
      mode === 'markers'
        ? markers.map((s) => ({
            id: s.token,
            label: s.label,
            token: s.token,
            kind: s.kind,
            occurrences: s.occurrences,
            context: s.context,
            defaultOn: true,
            long: LONG_NAME.test(s.name),
          }))
        : blocks.map((b) => ({
            id: b.id,
            label: b.text,
            current: b.text,
            kind: 'text' as const,
            occurrences: 1,
            context: b.context,
            group: b.paragraph,
            defaultOn: b.likelySample,
            long: b.text.length > 80,
          })),
    [mode, markers, blocks]
  );

  const isOn = (item: Item) => item.defaultOn !== flipped.has(item.id);
  const enabled = useMemo(() => new Set(items.filter(isOn).map((i) => i.id)), [items, flipped]);

  const output = useMemo(
    () => (mode === 'markers' ? fillBioTemplate(template, values, enabled) : fillTextBlocks(template, blocks, values, enabled)),
    [mode, template, blocks, values, enabled]
  );

  const active = items.filter((i) => enabled.has(i.id));
  const filledCount = active.filter((i) => values[i.id]?.trim()).length;
  const writable = active.filter((i) => i.kind === 'text');
  const emptyWritable = writable.filter((i) => !values[i.id]?.trim());
  const visible = mode === 'text' && !showAll ? items.filter((i) => enabled.has(i.id)) : items;
  const hiddenCount = items.length - visible.length;
  const applied = !!currentBio && currentBio === output;
  const usesJanitorStyles = JANITOR_CLASSES.test(template);

  useEffect(() => save(TEMPLATE_KEY, template), [template]);
  useEffect(() => {
    const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
    const empty = !Object.keys(kept).length && !flipped.size;
    save(STATE_KEY, empty ? '' : JSON.stringify({ values: kept, flipped: [...flipped] } satisfies Persisted));
  }, [values, flipped]);

  /** A new template starts clean; editing the current one keeps your work. */
  const adoptTemplate = (text: string, { fresh = true } = {}) => {
    if (new Blob([text]).size > MAX_TEMPLATE_BYTES) {
      notify('That template is over 300 KB. Bio templates are usually a few KB of HTML.', 'error');
      return;
    }
    setTemplate(text);
    if (fresh) {
      setValues({});
      setFlipped(new Set());
      setModeOverride(null);
      setShowAll(false);
    }
    setPasteDraft('');
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      adoptTemplate(await file.text());
      setEditingSource(false);
    } catch {
      notify(`Could not read ${file.name}.`, 'error');
    }
  };

  const fill = async () => {
    // Fill the gaps first; once every ticked spot has a value, the same button rewrites them.
    const targets = emptyWritable.length ? emptyWritable : writable;
    if (!targets.length) return;
    setIsFilling(true);
    try {
      const results = await onFill(
        targets.map((i) => ({ label: i.label, context: i.context, current: i.current, group: i.group }))
      );
      setValues((prev) => {
        const next = { ...prev };
        targets.forEach((item, n) => {
          if (results[n]) next[item.id] = results[n];
        });
        return next;
      });
      const missed = results.filter((r) => !r).length;
      if (missed) notify(`The model left ${missed} spot${missed > 1 ? 's' : ''} blank. Fill ${missed > 1 ? 'them' : 'it'} in by hand or try again.`);
    } catch (err: any) {
      notify(err?.message || 'Could not fill the template.', 'error');
    } finally {
      setIsFilling(false);
    }
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify('Your browser blocked clipboard access.', 'error');
    }
  };

  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const uploadInput = (
    <input ref={fileRef} type="file" accept=".html,.htm,.txt,.md,.css" className="hidden" onChange={onUpload} />
  );

  if (!template) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <h4 className="font-serif text-xl font-medium text-slate-900">Coded bio template</h4>
        <p className="mt-1 mb-5 max-w-2xl text-xs leading-relaxed text-slate-500">
          Bring your own HTML bio layout and the AI writes it from this card. Templates full of sample text (lorem ipsum, "Character
          Name", "Age・Pronouns・Quirk") work as-is. You can also mark spots with{' '}
          <code className="rounded bg-muted px-1">{'{{tagline}}'}</code> or <code className="rounded bg-muted px-1">[AGE]</code>.
          Your template is remembered in this browser.
        </p>
        {uploadInput}
        <div className="grid gap-3 md:grid-cols-[auto,1fr]">
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-auto self-start rounded-xl py-3">
            <FileUp className="mr-2 h-4 w-4" />
            Upload template
          </Button>
          <div className="space-y-2">
            <Textarea
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              placeholder={'…or paste your bio code here\n\n<p class="tagline">One-liner goes here.</p>\n<p><strong>Character Name</strong> Lorem ipsum…</p>'}
              className="min-h-[140px] bg-background font-mono text-xs"
            />
            <Button onClick={() => adoptTemplate(pasteDraft)} disabled={!pasteDraft.trim()} size="sm" className="rounded-lg">
              Use this template
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const noun = mode === 'markers' ? 'slot' : 'text block';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
      {uploadInput}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-serif text-xl font-medium text-slate-900">Coded bio template</h4>
          <p className="mt-1 text-xs text-slate-500">
            {items.length
              ? `${active.length} ${noun}${active.length === 1 ? '' : 's'} to fill · ${filledCount} filled`
              : `No ${noun}s found in this template.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setEditingSource((v) => !v)} className="rounded-lg text-xs">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {editingSource ? 'Done editing' : 'Edit source'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} className="rounded-lg text-xs">
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Remove this template? Filled text will be cleared too.')) {
                adoptTemplate('');
                setEditingSource(false);
              }
            }}
            className="rounded-lg text-xs hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>

      {editingSource && (
        <Textarea
          value={template}
          onChange={(e) => adoptTemplate(e.target.value, { fresh: false })}
          className="mb-5 min-h-[220px] bg-background font-mono text-xs"
          spellCheck={false}
        />
      )}

      {/* Both readings are offered only when the template could mean either. */}
      {markers.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Fill by
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {(['markers', 'text'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModeOverride(m)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === m ? 'bg-surface-raised text-primary shadow-sm' : 'hover:text-slate-700'
                )}
              >
                {m === 'markers' ? `Placeholders (${markers.length})` : `Sample text (${blocks.length})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'text' && items.length > 0 && (
        <p className="mb-4 max-w-3xl text-xs leading-relaxed text-slate-500">
          Every piece of visible text is listed. Filler is ticked for you; headings, credits and your own notes are not, so
          they stay exactly as written. Tick anything else you want rewritten.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {items.length > 0 && (
          <div className="space-y-3">
            <Button
              onClick={fill}
              disabled={isFilling || !writable.length}
              className="w-full rounded-xl bg-primary-solid text-white hover:bg-primary-hover"
            >
              {isFilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isFilling
                ? 'Writing…'
                : emptyWritable.length
                  ? `Fill ${emptyWritable.length} ${noun}${emptyWritable.length > 1 ? 's' : ''} with AI`
                  : `Rewrite ${writable.length} ${noun}${writable.length > 1 ? 's' : ''} with AI`}
            </Button>

            {visible.map((item) => {
              const on = enabled.has(item.id);
              const inputClass =
                'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
              const placeholder =
                item.kind === 'asset'
                  ? 'Paste a URL, colour or size'
                  : item.current
                    ? 'Leave empty to keep the original'
                    : item.long
                      ? `Write the ${item.label.toLowerCase()} for ${cardName || 'this character'}…`
                      : item.label;
              return (
                <div key={item.id} className={cn('rounded-xl border border-border bg-background p-3 transition-opacity', !on && 'opacity-60')}>
                  <label className="mb-1 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item.id)}
                      aria-label={`Fill ${item.label}`}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary-solid)]"
                    />
                    {item.current ? (
                      <span className={cn('min-w-0 text-sm text-slate-700', on && values[item.id]?.trim() && 'line-through decoration-slate-400/60')}>
                        {item.current.length > 140 ? `${item.current.slice(0, 140)}…` : item.current}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                        <code className="truncate text-[11px] text-slate-400">{item.token}</code>
                      </>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {item.occurrences > 1 && <span className="text-[10px] tabular-nums text-slate-400">×{item.occurrences}</span>}
                      {item.kind === 'asset' && (
                        <span
                          className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                          title="Looks like a URL, colour or size, which the AI cannot know"
                        >
                          You fill
                        </span>
                      )}
                    </span>
                  </label>
                  {/* Where this sits, so repeated filler ("Sample", "Lorem ipsum") can be told apart. */}
                  <p className="mb-2 ml-6 truncate text-[11px] text-slate-400" title={item.context}>
                    {nearby(item.context)}
                  </p>
                  {on &&
                    (item.long ? (
                      <textarea
                        value={values[item.id] || ''}
                        onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                        rows={3}
                        placeholder={placeholder}
                        className={cn(inputClass, 'ml-6 w-[calc(100%-1.5rem)] resize-y leading-relaxed')}
                      />
                    ) : (
                      <input
                        value={values[item.id] || ''}
                        onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                        placeholder={placeholder}
                        className={cn(inputClass, 'ml-6 w-[calc(100%-1.5rem)]')}
                      />
                    ))}
                </div>
              );
            })}

            {mode === 'text' && (hiddenCount > 0 || showAll) && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-muted hover:text-slate-700"
              >
                {showAll ? 'Show only ticked text' : `Show ${hiddenCount} more text block${hiddenCount > 1 ? 's' : ''} left as written`}
              </button>
            )}
          </div>
        )}

        {/* Preview: sticks in view while the list scrolls past. */}
        <div className={cn('flex flex-col lg:sticky lg:top-4 lg:self-start', !items.length && 'lg:col-span-2')}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-xs">
              {(['preview', 'html'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                    view === v ? 'bg-surface-raised text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {v === 'preview' ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                  {v === 'preview' ? 'Preview' : 'HTML'}
                </button>
              ))}
            </div>
            {view === 'preview' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewDark((d) => !d)}
                className="rounded-lg text-xs"
                title="Preview against a light or dark page, like JanitorAI's two themes"
              >
                {previewDark ? <Moon className="mr-1.5 h-3.5 w-3.5" /> : <Sun className="mr-1.5 h-3.5 w-3.5" />}
                {previewDark ? 'Dark page' : 'Light page'}
              </Button>
            )}
          </div>

          {view === 'preview' ? (
            // sandbox="" disables scripts, forms and navigation: the template is untrusted markup.
            <iframe
              title="Bio preview"
              sandbox=""
              srcDoc={PREVIEW_PAGE[previewDark ? 'dark' : 'light'] + output}
              className="h-[clamp(300px,50vh,480px)] w-full rounded-xl border border-border"
            />
          ) : (
            <pre className="h-[clamp(300px,50vh,480px)] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed text-slate-700">
              {output}
            </pre>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyHtml} className="rounded-xl text-sm">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy HTML'}
            </Button>
            <Button
              onClick={() => {
                onApply(output);
                notify('Bio set on the card. It will be in the Bio field below.', 'success');
              }}
              disabled={applied}
              className="rounded-xl bg-primary-solid text-sm text-white hover:bg-primary-hover"
            >
              {applied && <Check className="mr-2 h-4 w-4" />}
              {applied ? 'Card bio set' : 'Use as card bio'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {usesJanitorStyles
              ? "This template borrows JanitorAI's own styles, so the preview shows the content but not the final layout. Paste it into JanitorAI to see it styled. "
              : ''}
            Text is inserted as plain text; everything you left unticked is kept exactly as written.
          </p>
        </div>
      </div>
    </section>
  );
}
