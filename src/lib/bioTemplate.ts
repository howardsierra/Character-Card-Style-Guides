/**
 * Coded-bio templates: HTML/CSS bios with placeholder slots, as people share
 * them for JanitorAI. Detection is deterministic so the user can see and veto
 * exactly what will be replaced; only the filling is left to the model.
 */

export type SlotSyntax = 'double-brace' | 'double-bracket' | 'bracket';

/**
 * Text: prose the model can write from the card. Asset: an image URL, colour,
 * link or size that the model cannot know, so the user fills it in.
 */
export type SlotKind = 'text' | 'asset';

export interface BioSlot {
  /** Exact placeholder as it appears in the template, e.g. "{{tagline}}". */
  token: string;
  /** Inner name, e.g. "tagline". */
  name: string;
  label: string;
  syntax: SlotSyntax;
  kind: SlotKind;
  occurrences: number;
  /** Nearby visible text, so the model can tell a title from a paragraph. */
  context: string;
}

/** Macros JanitorAI substitutes itself; never treat these as slots. */
const RESERVED = new Set(['char', 'user']);

const ASSET_NAME = /\b(url|link|href|src|img|image|pic|picture|photo|icon|avatar|banner|gif|color|colour|hex|rgb|font|width|height|size|px|bg|background)\b/i;

const DOUBLE_BRACE = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g;
const DOUBLE_BRACKET = /\[\[\s*([^[\]\n]{1,40}?)\s*\]\]/g;
const BRACKET = /(?<!\[)\[([^[\]\n]{1,40})\](?!\])/g;

/** Keep string offsets intact while blanking a region out. */
const blank = (m: string) => m.replace(/[^\n]/g, ' ');

/** Ranges that are markup rather than visible text: tags, CSS, scripts, comments. */
function maskNonText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<[^>]*>/g, blank);
}

/** Like maskNonText, but leaves tags and CSS in place: only comments and scripts go. */
function maskCommentsAndScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

/**
 * A single-bracket span is common in prose ("[CW: gore]"), so it only counts
 * as a slot when it reads like one: ALL CAPS, an instruction ("insert ..."),
 * or a short Title Case label.
 */
function looksLikeBracketSlot(inner: string): boolean {
  const s = inner.trim();
  if (!/^[A-Za-z][A-Za-z0-9 _'/&-]*$/.test(s)) return false;
  if (/^(insert|add|your|enter|put|type)\b/i.test(s)) return true;
  if (/[A-Z]/.test(s) && s === s.toUpperCase()) return true;
  const words = s.split(/\s+/);
  return words.length <= 5 && words.every((w) => /^[A-Z0-9]/.test(w));
}

function humanize(name: string): string {
  const s = name
    .replace(/^(insert|add|enter|put|type)\s+/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const cased = s.replace(/\b(url|id|rgb|hex|html|css|gif|nsfw|sfw|pov|oc)\b/g, (w) => w.toUpperCase());
  return cased.charAt(0).toUpperCase() + cased.slice(1);
}

function visibleContext(html: string, index: number, token: string): string {
  const start = Math.max(0, index - 160);
  const end = Math.min(html.length, index + token.length + 160);
  const before = maskNonText(html.slice(start, index)).replace(/\s+/g, ' ').trim().slice(-60);
  const after = maskNonText(html.slice(index + token.length, end)).replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${before} ___ ${after}`.trim();
}

/** Byte ranges of every tag and every <style> block: places text must not be HTML-ified. */
function codeRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const re of [/<style[\s\S]*?<\/style>/gi, /<[^>]*>/g]) {
    for (const m of html.matchAll(re)) ranges.push([m.index!, m.index! + m[0].length]);
  }
  return ranges;
}

const inRanges = (i: number, ranges: [number, number][]) => ranges.some(([a, b]) => i >= a && i < b);

export function detectBioSlots(template: string): BioSlot[] {
  if (!template) return [];
  const searchable = maskCommentsAndScripts(template);
  const textOnly = maskNonText(template);
  const code = codeRanges(template);
  const byToken = new Map<string, BioSlot & { firstIndex: number; inCode: boolean }>();

  const record = (token: string, name: string, syntax: SlotSyntax, index: number) => {
    const existing = byToken.get(token);
    if (existing) {
      existing.occurrences += 1;
      existing.inCode ||= inRanges(index, code);
      return;
    }
    byToken.set(token, {
      token,
      name,
      label: humanize(name),
      syntax,
      kind: 'text',
      occurrences: 1,
      context: '',
      firstIndex: index,
      inCode: inRanges(index, code),
    });
  };

  // Brace and double-bracket slots are unambiguous, so they count anywhere,
  // including attributes and CSS (e.g. src="{{banner}}", color: {{accent}}).
  for (const m of searchable.matchAll(DOUBLE_BRACE)) {
    const name = m[1].trim();
    if (!RESERVED.has(name.toLowerCase())) record(m[0], name, 'double-brace', m.index!);
  }
  for (const m of searchable.matchAll(DOUBLE_BRACKET)) record(m[0], m[1].trim(), 'double-bracket', m.index!);

  // Single brackets collide with CSS attribute selectors and prose, so they
  // are only read from visible text and only when they look like a slot.
  for (const m of textOnly.matchAll(BRACKET)) {
    if (looksLikeBracketSlot(m[1])) record(m[0], m[1].trim(), 'bracket', m.index!);
  }

  return [...byToken.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(({ firstIndex, inCode, ...slot }) => ({
      ...slot,
      kind: inCode || ASSET_NAME.test(slot.name) ? 'asset' : 'text',
      context: visibleContext(template, firstIndex, slot.token),
    }));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitute values into the template. Values are inserted as text, never as
 * markup, so a stray "<" or quote cannot break the layout. In visible text,
 * line breaks become <br>; inside tags and CSS they are left as spaces.
 * Slots with no value keep their placeholder so the gap stays obvious.
 */
export function fillBioTemplate(template: string, values: Record<string, string>, enabled?: Set<string>): string {
  const tokens = Object.keys(values)
    .filter((t) => values[t]?.trim() && (!enabled || enabled.has(t)))
    // Longest first, so "{{name}}" is not replaced inside "{{name_full}}".
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return template;

  const code = codeRanges(template);
  const pattern = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

  return template.replace(pattern, (match, offset: number) => {
    const escaped = escapeHtml(values[match].trim());
    return inRanges(offset, code) ? escaped.replace(/\s*\n\s*/g, ' ') : escaped.replace(/\n/g, '<br>');
  });
}

/** Placeholders a finished bio should not still contain; used by the pre-publish checks. */
export function unfilledBioSlots(bio: string): BioSlot[] {
  // Title Case brackets are too easily real prose ("[Content Warning]") to nag about.
  return detectBioSlots(bio).filter(
    (s) => s.syntax !== 'bracket' || s.name === s.name.toUpperCase() || /^(insert|add|your|enter|put|type)\b/i.test(s.name)
  );
}

/* ---------------------------------------------------------------------------
   Sample-text templates.

   Most bio templates shared on JanitorAI have no placeholder markers: they ship
   with filler ("Lorem ipsum…", "Character Name", "Age・Pronouns・Quirk") that the
   author overwrites. These helpers treat each run of visible text as a block
   that can be replaced in place, leaving every byte of markup untouched -- many
   templates borrow JanitorAI's own class names, so re-serialising the HTML is
   not an option.
   --------------------------------------------------------------------------- */

export interface TextBlock {
  /** Stable within one template: `t` + run index. */
  id: string;
  /** Offsets of the raw text run in the template source. */
  start: number;
  end: number;
  /** Decoded, trimmed text as a reader sees it. */
  text: string;
  /** Index of the block-level element (paragraph) the run sits in. */
  paragraph: number;
  /** Visible text before and after, "___" marking this run. */
  context: string;
  /** Reads like template filler, so it starts ticked. */
  likelySample: boolean;
}

/**
 * Common filler phrasing across shared templates, in English and the Spanish lorem many use.
 * Link labels ("Short link 1") are deliberately absent: their destinations are the author's.
 */
const FILLER =
  /lorem ipsum|dolor sit amet|texto de relleno|goes here|\bsample\b|placeholder|one-liner|two-liner|three-liner|\bname\b|something x something|pronouns|\bquirk\b|・anything/i;

/** Signals text left over from a template; used by the pre-publish checks. */
export const FILLER_TEXT = /lorem ipsum|dolor sit amet|texto de relleno|goes here|sample text/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK_OPEN = /<(p|div|h[1-6]|li|blockquote|section|article|header|footer|td|th)\b/gi;

export function extractTextBlocks(template: string): TextBlock[] {
  if (!template) return [];
  // Blank out CSS, scripts and comments without moving any offsets.
  const masked = template
    .replace(/<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);

  const paragraphStarts = [...masked.matchAll(BLOCK_OPEN)].map((m) => m.index!);
  const paragraphAt = (i: number) => {
    let n = 0;
    while (n < paragraphStarts.length && paragraphStarts[n] <= i) n++;
    return n;
  };

  type Run = { start: number; end: number; text: string; paragraph: number };
  const runs: Run[] = [];
  for (const m of masked.matchAll(/(?:^|>)([^<>]+)(?=<|$)/g)) {
    const raw = m[1];
    const start = m.index! + m[0].length - raw.length;
    const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    // Spacer dots and pure whitespace carry no meaning for the reader or the model.
    if (!text || /^[.\s]+$/.test(text)) continue;
    runs.push({ start, end: start + raw.length, text, paragraph: paragraphAt(start) });
  }

  // One readable stream, so each block can be shown in context. Paragraphs are
  // separated by " / ". Within a paragraph, a drop-cap joins straight onto the
  // rest of its word ("T" + "HE RECAP." reads "THE RECAP."), a run that ended in
  // a space keeps it, and otherwise distinct fields get " · " so a name, its
  // stats line and its description do not run together.
  const pieces: { text: string; at: number }[] = [];
  let stream = '';
  runs.forEach((r, i) => {
    if (i > 0) {
      const prev = runs[i - 1];
      const prevRaw = decodeEntities(template.slice(prev.start, prev.end));
      stream +=
        r.paragraph !== prev.paragraph ? ' / ' : prev.text.length <= 2 ? '' : /\s$/.test(prevRaw) ? ' ' : ' · ';
    }
    pieces.push({ text: r.text, at: stream.length });
    stream += r.text;
  });

  return runs.flatMap((r, i) => {
    // At least two letters in any script: skips "✦", "¹", "#", emoji and the
    // single drop-cap letters headings are often built from.
    if (!/\p{L}.*\p{L}/su.test(r.text)) return [];
    const at = pieces[i].at;
    const before = stream.slice(Math.max(0, at - 220), at).trimStart();
    const after = stream.slice(at + r.text.length, at + r.text.length + 120).trimEnd();
    return [{
      id: `t${i}`,
      start: r.start,
      end: r.end,
      text: r.text,
      paragraph: r.paragraph,
      context: `${before.trimEnd()} ___ ${after.trimStart()}`.trim(),
      likelySample: FILLER.test(r.text),
    }];
  });
}

/**
 * Splice replacements into the template by position. Untouched blocks, and
 * every tag and attribute, come through byte-for-byte. Surrounding whitespace
 * of each run is kept, so "Sample " followed by another pill keeps its gap.
 */
export function fillTextBlocks(template: string, blocks: TextBlock[], values: Record<string, string>, enabled?: Set<string>): string {
  const edits = blocks
    .filter((b) => values[b.id]?.trim() && (!enabled || enabled.has(b.id)))
    .sort((a, b) => b.start - a.start);

  let out = template;
  for (const b of edits) {
    const raw = template.slice(b.start, b.end);
    const lead = raw.match(/^\s*/)![0];
    const trail = raw.match(/\s*$/)![0];
    const value = escapeHtml(values[b.id].trim()).replace(/\n/g, '<br>');
    out = out.slice(0, b.start) + lead + value + trail + out.slice(b.end);
  }
  return out;
}
