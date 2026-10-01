/**
 * JanitorAI's tag rules and preset tags.
 *
 * Source: JanitorAI's help-centre "FAQ: Tags" article
 * (help.janitorai.com/en/article/faq-tags-1bo153l). Descriptions are the
 * FAQ's own wording where it gives one. A handful of presets are marked
 * `observed`: they are offered on the site but their FAQ description was not
 * available, so the description here is ours. If JanitorAI renames a tag,
 * this is the one list to update.
 */

export interface PresetTag {
  name: string;
  group: 'Rating' | 'Gender' | 'POV' | 'Dynamic' | 'Type' | 'Source' | 'Species' | 'Theme' | 'Role';
  description: string;
  observed?: true;
}

export const RATING_TAGS = ['Limited', 'Limitless'] as const;

/** JanitorAI allows at most this many tags, presets and custom combined. */
export const MAX_TAGS = 10;

export const PRESET_TAGS: PresetTag[] = [
  { name: 'Limited', group: 'Rating', description: 'Platonic content exclusively (family, friends, pets, etc.)' },
  { name: 'Limitless', group: 'Rating', description: 'Sexual or romantic content (romantic or sexual partners, NSFW plots, etc.)' },

  { name: 'Male', group: 'Gender', description: 'Male presenting characters' },
  { name: 'Female', group: 'Gender', description: 'Female presenting characters' },
  { name: 'Trans', group: 'Gender', description: 'Characters that identify as transgender' },

  { name: 'AnyPOV', group: 'POV', description: 'Any POV can interact; intro typically uses they/them or pronoun macros' },
  { name: 'MalePOV', group: 'POV', description: 'Centered on a male POV; intro typically uses he/him' },
  { name: 'FemalePOV', group: 'POV', description: 'Centered on a female POV; intro typically uses she/her' },

  { name: 'Dominant', group: 'Dynamic', description: 'Considered dominant (typically in a BDSM setting)' },
  { name: 'Submissive', group: 'Dynamic', description: 'Considered submissive (typically in a BDSM setting)' },
  { name: 'Switch', group: 'Dynamic', description: 'Both dominant and submissive (typically in a BDSM setting)' },

  { name: 'OC', group: 'Type', description: 'Your original character' },
  { name: 'Fictional', group: 'Type', description: 'Not-real, imaginative characters' },
  { name: 'Multiple', group: 'Type', description: 'Multiple characters coded in ("duo bots" or "multi bots")' },
  { name: 'Scenario', group: 'Type', description: 'Not a character: RPG bots, generators, guides, etc.' },
  { name: 'Smut', group: 'Type', description: 'Bots whose sole purpose is NSFW' },

  { name: 'Anime', group: 'Source', description: 'Characters from anime' },
  { name: 'Game', group: 'Source', description: 'Characters from video games' },
  { name: 'Sci-Fi', group: 'Source', description: 'Characters from science fiction' },
  { name: 'Movies & TV', group: 'Source', description: 'Characters from films or television', observed: true },
  { name: 'Books', group: 'Source', description: 'Characters from books', observed: true },

  { name: 'Non-Human', group: 'Species', description: 'Characters that are not human (slimes, aliens, etc.)' },
  { name: 'Monster', group: 'Species', description: 'Characters considered monsters' },
  { name: 'Robot', group: 'Species', description: 'Mechanical or robotic characters, e.g. androids' },
  { name: 'Elf', group: 'Species', description: 'Elven characters' },
  { name: 'Vampire', group: 'Species', description: 'Vampiric characters' },
  { name: 'Demon', group: 'Species', description: 'Demonic characters', observed: true },
  { name: 'Furry', group: 'Species', description: 'Anthropomorphic animals or creatures' },

  { name: 'Angst', group: 'Theme', description: 'Moody themes: fear, anxiety, sadness, etc.' },
  { name: 'Fluff', group: 'Theme', description: 'Softer, wholesome themes and comfort' },
  { name: 'Horror', group: 'Theme', description: 'Disturbing or creepy themes' },
  { name: 'Dead Dove', group: 'Theme', description: 'Darker themes; heed the warnings' },
  { name: 'Fantasy', group: 'Theme', description: 'Fantasy settings and characters', observed: true },
  { name: 'Historical', group: 'Theme', description: 'Historical settings and characters', observed: true },

  { name: 'Royalty', group: 'Role', description: 'Characters with royal lineage' },
  { name: 'Villain', group: 'Role', description: 'Characters considered a villain or evil' },
  { name: 'Detective', group: 'Role', description: 'Characters who are detectives' },
];

const BY_LOWER = new Map(PRESET_TAGS.map((t) => [t.name.toLowerCase(), t]));
/** Also match presets typed without their punctuation or spacing ("scifi", "dead dove"). */
const BY_KEY = new Map(PRESET_TAGS.map((t) => [t.name.toLowerCase().replace(/[^a-z0-9]/g, ''), t]));

/** The canonical preset for a typed tag, if it is one. */
export function findPreset(tag: string): PresetTag | undefined {
  const lower = tag.trim().toLowerCase();
  return BY_LOWER.get(lower) ?? BY_KEY.get(lower.replace(/[^a-z0-9]/g, ''));
}

/** Custom tags: 3 to 21 characters, letters and numbers only. */
export const CUSTOM_TAG = /^[a-z0-9]{3,21}$/i;

/**
 * Coerce free text into a valid custom tag, or null if nothing usable is left.
 * "Slow Burn" -> "SlowBurn"; "enemies-to-lovers" -> "EnemiesToLovers".
 */
export function toCustomTag(raw: string): string | null {
  const words = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return null;
  const joined =
    words.length === 1 ? words[0] : words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return CUSTOM_TAG.test(joined) ? joined : null;
}

/** Map a tag onto the form JanitorAI will accept: the canonical preset, else a cleaned custom tag. */
export function normalizeTag(raw: string): string | null {
  return findPreset(raw)?.name ?? toCustomTag(raw);
}

export interface TagProblem {
  severity: 'error' | 'warning';
  message: string;
}

export function validateJanitorTags(tags: string[]): TagProblem[] {
  const problems: TagProblem[] = [];
  const presets = tags.map(findPreset);
  const ratings = presets.filter((p) => p?.group === 'Rating').map((p) => p!.name);

  if (!ratings.length) {
    problems.push({ severity: 'error', message: 'JanitorAI requires a rating tag: Limited (platonic) or Limitless (romantic/NSFW).' });
  } else if (new Set(ratings).size > 1) {
    problems.push({ severity: 'warning', message: 'Both Limited and Limitless are set. Pick the one that fits.' });
  }

  if (tags.length > MAX_TAGS) {
    problems.push({ severity: 'error', message: `${tags.length} tags, but JanitorAI allows at most ${MAX_TAGS}.` });
  }

  const invalid = tags.filter((t, i) => !presets[i] && !CUSTOM_TAG.test(t));
  if (invalid.length) {
    problems.push({
      severity: 'error',
      message: `Custom tags must be 3–21 letters or numbers, no spaces: ${invalid.map((t) => `"${t}"`).join(', ')}.`,
    });
  }

  const povs = presets.filter((p) => p?.group === 'POV').map((p) => p!.name);
  if (povs.includes('AnyPOV') && povs.length > 1) {
    problems.push({ severity: 'warning', message: 'AnyPOV alongside a specific POV tag sends mixed signals.' });
  }

  return problems;
}
