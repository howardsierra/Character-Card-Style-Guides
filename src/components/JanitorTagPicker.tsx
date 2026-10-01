import { Check, ChevronDown, Copy, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TagSuggestions } from '../lib/api';
import { MAX_TAGS, PRESET_TAGS, RATING_TAGS, type PresetTag, findPreset, normalizeTag, validateJanitorTags } from '../lib/janitorTags';
import { cn } from '../lib/utils';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Omit to hide AI suggestions. */
  onSuggest?: () => Promise<TagSuggestions>;
  notify: (message: string, variant?: 'error' | 'success' | 'info') => void;
}

const GROUP_ORDER: PresetTag['group'][] = ['Gender', 'POV', 'Type', 'Source', 'Species', 'Theme', 'Role', 'Dynamic'];

/** Same tag once normalised: "slow burn" and "SlowBurn" are one tag to JanitorAI. */
const sameTag = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase() || (normalizeTag(a) ?? a).toLowerCase() === (normalizeTag(b) ?? b).toLowerCase();

/** Present, but in a form JanitorAI will reject (e.g. imported "slow burn"). */
const isInvalid = (tag: string) => !findPreset(tag) && normalizeTag(tag) !== tag;

/**
 * Add a tag to a list. If an equivalent but invalid spelling is already there,
 * repair it in place instead of adding a near-duplicate. Returns false only
 * when the tag could not be added because the list is full.
 */
function mergeTag(list: string[], tag: string): boolean {
  const i = list.findIndex((t) => sameTag(t, tag));
  if (i >= 0) {
    if (isInvalid(list[i])) list[i] = tag;
    return true;
  }
  if (list.length >= MAX_TAGS) return false;
  list.push(tag);
  return true;
}

export function JanitorTagPicker({ tags, onChange, onSuggest, notify }: Props) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestions | null>(null);

  const problems = useMemo(() => validateJanitorTags(tags), [tags]);
  const rating = tags.map(findPreset).find((p) => p?.group === 'Rating')?.name;
  const room = MAX_TAGS - tags.length;

  /** Add tags in order, stopping at the limit. Returns what was actually added. */
  const add = (incoming: string[]): string[] => {
    const next = [...tags];
    const added = incoming.filter((t) => mergeTag(next, t));
    if (next.some((t, i) => t !== tags[i]) || next.length !== tags.length) onChange(next);
    return added;
  };

  const remove = (tag: string) => onChange(tags.filter((t) => !sameTag(t, tag)));

  /** Added in a form JanitorAI accepts; an invalid equivalent does not count. */
  const hasValid = (tag: string) => tags.some((t) => sameTag(t, tag) && !isInvalid(t));

  const toggle = (tag: string) => {
    if (hasValid(tag)) return remove(tag);
    if (!add([tag]).length) notify(`JanitorAI allows ${MAX_TAGS} tags. Remove one to add "${tag}".`);
  };

  /** Ratings are exclusive: choosing one replaces the other. */
  const setRating = (r: (typeof RATING_TAGS)[number]) => {
    const rest = tags.filter((t) => findPreset(t)?.group !== 'Rating');
    onChange([r, ...rest]);
  };

  const commitDraft = () => {
    const parts = draft.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const parsed = parts.map((raw) => ({ raw, tag: normalizeTag(raw) }));
    const rejected = parsed.filter((p) => !p.tag).map((p) => p.raw);
    const valid = parsed.filter((p): p is { raw: string; tag: string } => !!p.tag);

    // Build the final list in one pass: a typed rating replaces the current one,
    // then other tags fill whatever room is left, in the order typed.
    const typedRating = [...valid].reverse().find((p) => findPreset(p.tag)?.group === 'Rating')?.tag;
    const next = typedRating ? [typedRating, ...tags.filter((t) => findPreset(t)?.group !== 'Rating')] : [...tags];
    const added: string[] = [];
    let overflow = 0;
    for (const { tag } of valid) {
      if (findPreset(tag)?.group === 'Rating') continue;
      if (mergeTag(next, tag)) added.push(tag);
      else overflow++;
    }
    if (typedRating || added.length) onChange(next);

    // Say when a tag was reshaped ("slow burn" -> SlowBurn, "scifi" -> Sci-Fi), but
    // not for a change of case alone, which is just noise.
    const reshaped = valid
      .filter((p) => p.tag.toLowerCase() !== p.raw.toLowerCase().replace(/\s+/g, ' ') && added.includes(p.tag))
      .map((p) => `"${p.raw}" → ${p.tag}`);
    if (rejected.length) notify(`Custom tags need 3–21 letters or numbers: ${rejected.map((r) => `"${r}"`).join(', ')}.`, 'error');
    else if (overflow) notify(`Only ${MAX_TAGS} tags fit. ${overflow} ${overflow > 1 ? 'were' : 'was'} not added.`);
    else if (reshaped.length) notify(`Added as JanitorAI accepts it: ${reshaped.join(', ')}.`, 'info');
    setDraft('');
  };

  const suggest = async () => {
    if (!onSuggest) return;
    setSuggesting(true);
    try {
      setSuggestions(await onSuggest());
    } catch (err: any) {
      notify(err?.message || 'Could not suggest tags.', 'error');
    } finally {
      setSuggesting(false);
    }
  };

  /** Rating first (replacing any other), then the best-ranked suggestions that fit. */
  const addTopPicks = () => {
    if (!suggestions) return;
    let base = tags;
    if (suggestions.rating && !rating) {
      base = [suggestions.rating.tag, ...tags.filter((t) => findPreset(t)?.group !== 'Rating')];
    }
    const next = [...base];
    for (const s of suggestions.tags) mergeTag(next, s.tag);
    onChange(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tags.join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify('Your browser blocked clipboard access.', 'error');
    }
  };

  const unaddedSuggestions = suggestions?.tags.filter((s) => !hasValid(s.tag)).length ?? 0;
  const ratingNeedsAdding = !!suggestions?.rating && !rating;

  return (
    <div id="janitor-field-tags" className="rounded-xl border border-border bg-background p-4 transition-shadow">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Tags</span>
          <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', tags.length > MAX_TAGS ? 'bg-red-50 text-red-700' : 'bg-muted text-slate-500')}>
            {tags.length} / {MAX_TAGS}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onSuggest && (
            <button
              onClick={suggest}
              disabled={suggesting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
            >
              {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {suggesting ? 'Reading the card…' : suggestions ? 'Suggest again' : 'Suggest tags'}
            </button>
          )}
          <button
            onClick={copy}
            disabled={!tags.length}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Rating: required and exclusive, so it gets its own control. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rating</span>
        {RATING_TAGS.map((r) => {
          const preset = findPreset(r)!;
          const on = rating === r;
          return (
            <button
              key={r}
              onClick={() => setRating(r)}
              title={preset.description}
              aria-pressed={on}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-slate-500 hover:border-foreground/20 hover:text-slate-700'
              )}
            >
              {on && <Check className="-ml-0.5 mr-1 inline h-3 w-3" strokeWidth={3} />}
              {r}
            </button>
          );
        })}
        {!rating && <span className="text-[11px] text-red-600">Required</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags
          .filter((t) => findPreset(t)?.group !== 'Rating')
          .map((t) => {
            const preset = findPreset(t);
            const invalid = isInvalid(t);
            const fix = invalid ? normalizeTag(t) : null;
            return (
              <span
                key={t}
                title={preset ? preset.description : invalid ? 'JanitorAI will not accept this: 3–21 letters or numbers, no spaces' : 'Custom tag'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs',
                  invalid
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : preset
                      ? 'border-border bg-card text-slate-700'
                      : 'border-dashed border-border bg-card text-slate-700'
                )}
              >
                {!preset && <span className="text-slate-400">#</span>}
                {t}
                {fix && (
                  <button
                    onClick={() => onChange(tags.map((x) => (x === t ? fix : x)))}
                    title={`Change to ${fix}, which JanitorAI accepts`}
                    className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 hover:bg-red-200"
                  >
                    → {fix}
                  </button>
                )}
                <button onClick={() => remove(t)} aria-label={`Remove tag ${t}`} className="rounded-full p-0.5 text-slate-400 hover:bg-muted hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commitDraft();
            } else if (e.key === 'Backspace' && !draft) {
              const last = [...tags].reverse().find((t) => findPreset(t)?.group !== 'Rating');
              if (last) remove(last);
            }
          }}
          onBlur={() => draft.trim() && commitDraft()}
          disabled={room <= 0 && !draft}
          placeholder={room <= 0 ? 'Tag limit reached' : tags.length ? 'Add a tag…' : 'Type a tag, or use Suggest'}
          className="min-w-[9rem] flex-1 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {problems.map((p) => (
            <li key={p.message} className={cn('text-xs', p.severity === 'error' ? 'text-red-600' : 'text-amber-700')}>
              {p.message}
            </li>
          ))}
        </ul>
      )}

      {/* Suggestions */}
      {suggestions && (
        <div className="mt-4 rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Suggested for this card</span>
            <div className="flex items-center gap-1">
              {(unaddedSuggestions > 0 || ratingNeedsAdding) && room > 0 && (
                <button
                  onClick={addTopPicks}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-solid px-2.5 py-1 text-xs font-semibold text-white transition-all hover:brightness-110"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add top picks
                </button>
              )}
              <button onClick={() => setSuggestions(null)} aria-label="Dismiss suggestions" className="rounded-lg p-1 text-slate-400 hover:bg-muted hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {suggestions.rating && (
            <div className="mb-2 flex items-start gap-2 text-xs">
              <button
                onClick={() => setRating(suggestions.rating!.tag)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-0.5 font-medium transition-colors',
                  rating === suggestions.rating.tag ? 'border-primary bg-primary/10 text-primary' : 'border-border text-slate-700 hover:border-primary/40'
                )}
              >
                {rating === suggestions.rating.tag && <Check className="-ml-0.5 mr-1 inline h-3 w-3" strokeWidth={3} />}
                {suggestions.rating.tag}
              </button>
              <span className="pt-0.5 text-slate-500">{suggestions.rating.reason}</span>
            </div>
          )}

          <ul className="space-y-1">
            {suggestions.tags.map((s) => {
              const added = hasValid(s.tag);
              const blocked = !added && room <= 0;
              return (
                <li key={s.tag} className="flex items-start gap-2 text-xs">
                  <button
                    onClick={() => toggle(s.tag)}
                    disabled={blocked}
                    title={blocked ? `JanitorAI allows ${MAX_TAGS} tags` : added ? 'Remove' : 'Add'}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors disabled:opacity-40',
                      added ? 'border-primary bg-primary/10 text-primary' : 'border-border text-slate-700 hover:border-primary/40',
                      !s.preset && !added && 'border-dashed'
                    )}
                  >
                    {added ? <Check className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" />}
                    {!s.preset && <span className="opacity-60">#</span>}
                    {s.tag}
                  </button>
                  <span className="pt-0.5 text-slate-500">
                    {s.reason}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Best matches first. Dashed tags with # are custom; the rest are JanitorAI's own presets.
          </p>
        </div>
      )}

      {/* Browse presets */}
      <button
        onClick={() => setBrowsing((b) => !b)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        aria-expanded={browsing}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', browsing && 'rotate-180')} />
        Browse JanitorAI's preset tags
      </button>
      {browsing && (
        <div className="mt-2 space-y-2.5">
          {GROUP_ORDER.map((group) => (
            <div key={group}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.filter((t) => t.group === group).map((t) => {
                  const on = hasValid(t.name);
                  return (
                    <button
                      key={t.name}
                      onClick={() => toggle(t.name)}
                      title={t.description}
                      aria-pressed={on}
                      disabled={!on && room <= 0}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-40',
                        on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-slate-600 hover:border-foreground/20'
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
