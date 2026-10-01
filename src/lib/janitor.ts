import { FILLER_TEXT, unfilledBioSlots } from './bioTemplate';
import type { CharacterCard } from './parser';

/**
 * Helpers for preparing a forged (SillyTavern-shaped) card for JanitorAI.
 *
 * Kept free of React so the mapping and the checks can be unit tested, and so
 * the numbers shown here agree with the per-field badges elsewhere in the app.
 */

/** Same chars/4 heuristic the Forge badges use. An estimate, not a tokenizer. */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface JanitorField {
  key: 'name' | 'bio' | 'personality' | 'scenario' | 'initialMessage' | 'exampleDialogs';
  label: string;
  value: string;
  /** Re-sent with every message, so it permanently occupies context. */
  permanent: boolean;
  hint: string;
}

/**
 * Map a card onto JanitorAI's creator form.
 *
 * SillyTavern splits the definition across `description` and `personality`;
 * JanitorAI has a single Personality box for the whole definition, so both are
 * folded into it. The public Bio comes from creator_notes, which is display-only
 * on JanitorAI and never sent to the model.
 */
export function toJanitorFields(card: CharacterCard): JanitorField[] {
  const definition = [card.description, card.personality]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n\n');

  return [
    {
      key: 'name',
      label: 'Character Name',
      value: card.name || '',
      permanent: false,
      hint: 'Shown on the card and substituted for {{char}}.',
    },
    {
      key: 'bio',
      label: 'Character Bio',
      value: (card.creator_notes || '').trim(),
      permanent: false,
      hint: 'Public page text. Not sent to the model, so it costs no tokens.',
    },
    {
      key: 'personality',
      label: 'Personality',
      value: definition,
      permanent: true,
      hint: 'The definition. Folds the card description and personality together.',
    },
    {
      key: 'scenario',
      label: 'Scenario',
      value: (card.scenario || '').trim(),
      permanent: true,
      hint: 'The situation the chat opens in.',
    },
    {
      key: 'initialMessage',
      label: 'Initial Message',
      value: (card.first_mes || '').trim(),
      permanent: false,
      hint: 'The opener. It scrolls out of context as the chat grows.',
    },
    {
      key: 'exampleDialogs',
      label: 'Example Dialogs',
      value: (card.mes_example || '').trim(),
      permanent: true,
      hint: 'Voice samples, written as {{char}}: / {{user}}: lines.',
    },
  ];
}

export interface TokenBreakdown {
  permanent: number;
  temporary: number;
  byField: Record<JanitorField['key'], number>;
}

export function janitorTokenBreakdown(card: CharacterCard): TokenBreakdown {
  const fields = toJanitorFields(card);
  const byField = Object.fromEntries(
    fields.map((f) => [f.key, f.key === 'bio' || f.key === 'name' ? 0 : estimateTokens(f.value)])
  ) as TokenBreakdown['byField'];

  return {
    permanent: fields.filter((f) => f.permanent).reduce((n, f) => n + byField[f.key], 0),
    temporary: byField.initialMessage,
    byField,
  };
}

export type IssueSeverity = 'error' | 'warning' | 'tip';

export interface CardIssue {
  id: string;
  severity: IssueSeverity;
  field: JanitorField['key'] | 'card';
  message: string;
}

/**
 * Macros JanitorAI will not substitute. Matching is deliberately limited to the
 * malformed shapes people actually type, so prose like "{the user}" in a
 * definition does not trip it.
 */
const MALFORMED_MACRO = /(?<!\{)\{(user|char)\}(?!\})|<(user|char)>|\{\{\s+(user|char)\s*\}\}|\{\{\s*(user|char)\s+\}\}/gi;
const MISCASED_MACRO = /\{\{(User|USER|Char|CHAR)\}\}/g;

/** Second-person or {{user}}-subject narration that decides the user's actions. */
const GODMODDING = [
  /\{\{user\}\}\s+(says|said|asks|asked|replies|replied|nods|nodded|smiles|smiled|laughs|laughed|feels|felt|thinks|thought|decides|decided|agrees|agreed|walks|walked|looks|looked)\b/i,
  /\byou\s+(say|said|reply|replied|nod|nodded|smile|smiled|laugh|laughed|feel|felt|think|thought|decide|decided|agree|agreed|blush|blushed)\b/i,
];

const PLACEHOLDER = /\[(insert|add|your|name|fill)[^\]]*\]|\bTODO\b|\bTBD\b|\bFill in the\b/i;

function countUnpairedAsterisks(text: string): number {
  // Strip bold markers first; a lone remaining * means an action was left open.
  const stripped = text.replace(/\*\*/g, '');
  return (stripped.match(/\*/g) || []).length % 2;
}

function countStraightQuotes(text: string): number {
  return (text.match(/"/g) || []).length % 2;
}

/**
 * Pre-publish checks for the things that most often go wrong on JanitorAI:
 * macros that will not substitute, openers that act for the user, unfinished
 * template text, and definitions too heavy for the context budget.
 */
export function lintCard(card: CharacterCard, permanentBudget: number): CardIssue[] {
  const issues: CardIssue[] = [];
  const fields = toJanitorFields(card);
  const get = (k: JanitorField['key']) => fields.find((f) => f.key === k)!.value;

  if (!get('name')) {
    issues.push({ id: 'name-missing', severity: 'error', field: 'name', message: 'The card has no name.' });
  }
  if (!get('personality')) {
    issues.push({ id: 'personality-missing', severity: 'error', field: 'personality', message: 'Personality is empty, so the model has nothing to play.' });
  }
  if (!get('initialMessage')) {
    issues.push({ id: 'opener-missing', severity: 'error', field: 'initialMessage', message: 'There is no initial message to open the chat.' });
  }
  if (!get('scenario')) {
    issues.push({ id: 'scenario-missing', severity: 'tip', field: 'scenario', message: 'Scenario is empty. A line of setup helps the opener land.' });
  }
  if (!get('bio')) {
    issues.push({ id: 'bio-missing', severity: 'tip', field: 'bio', message: 'No public bio yet. It is what browsers read before starting a chat.' });
  } else {
    const gaps = unfilledBioSlots(get('bio'));
    if (gaps.length) {
      const shown = gaps.slice(0, 3).map((g) => g.token).join(', ');
      issues.push({
        id: 'bio-unfilled',
        severity: 'warning',
        field: 'bio',
        message: `The bio still has ${gaps.length} unfilled slot${gaps.length > 1 ? 's' : ''}: ${shown}${gaps.length > 3 ? ', …' : ''}.`,
      });
    } else if (FILLER_TEXT.test(get('bio'))) {
      // Sample-text templates have no markers, so look for the filler itself.
      issues.push({
        id: 'bio-filler',
        severity: 'warning',
        field: 'bio',
        message: 'The bio still contains template filler text (lorem ipsum or "goes here").',
      });
    }
  }

  const examples = get('exampleDialogs');
  if (!examples) {
    issues.push({ id: 'examples-missing', severity: 'tip', field: 'exampleDialogs', message: 'No example dialogs. Even two short exchanges anchor the voice.' });
  } else if (!/\{\{char\}\}\s*:/i.test(examples)) {
    issues.push({ id: 'examples-format', severity: 'warning', field: 'exampleDialogs', message: 'Example dialogs have no "{{char}}:" lines, so the model may not read them as dialogue.' });
  }

  for (const f of fields) {
    if (!f.value) continue;
    const malformed = f.value.match(MALFORMED_MACRO);
    if (malformed) {
      issues.push({
        id: `macro-malformed-${f.key}`,
        severity: 'error',
        field: f.key,
        message: `${f.label} uses ${[...new Set(malformed)].join(', ')}, which will not be substituted. Use {{user}} or {{char}}.`,
      });
    }
    const miscased = f.value.match(MISCASED_MACRO);
    if (miscased) {
      issues.push({
        id: `macro-case-${f.key}`,
        severity: 'warning',
        field: f.key,
        message: `${f.label} uses ${[...new Set(miscased)].join(', ')}. Lowercase {{user}} / {{char}} is the safe form.`,
      });
    }
    // The bio has its own template-aware check above, which also knows {{slot}} syntax.
    if (f.key !== 'bio' && PLACEHOLDER.test(f.value)) {
      issues.push({
        id: `placeholder-${f.key}`,
        severity: 'warning',
        field: f.key,
        message: `${f.label} still contains template placeholder text.`,
      });
    }
  }

  const opener = get('initialMessage');
  if (opener) {
    // Only narration can act for the user. Inside quotes, "you smile" is the
    // character talking to them, so dialogue is removed before matching.
    const narration = opener.replace(/"[^"]*"|“[^”]*”/g, ' ');
    if (GODMODDING.some((re) => re.test(narration))) {
      issues.push({
        id: 'opener-godmodding',
        severity: 'warning',
        field: 'initialMessage',
        message: 'The initial message seems to speak or act for {{user}}. Bots tend to copy that habit.',
      });
    }
    if (countUnpairedAsterisks(opener)) {
      issues.push({ id: 'opener-asterisks', severity: 'warning', field: 'initialMessage', message: 'The initial message has an unclosed *action*.' });
    }
    if (countStraightQuotes(opener)) {
      issues.push({ id: 'opener-quotes', severity: 'warning', field: 'initialMessage', message: 'The initial message has an unclosed "quote".' });
    }
    const words = opener.split(/\s+/).filter(Boolean).length;
    if (words < 60) {
      issues.push({ id: 'opener-short', severity: 'tip', field: 'initialMessage', message: `The initial message is ${words} words. Bots mirror the opener's length, so short openers get short replies.` });
    }
  }

  const { permanent } = janitorTokenBreakdown(card);
  if (permanentBudget > 0 && permanent > permanentBudget) {
    issues.push({
      id: 'over-budget',
      severity: 'warning',
      field: 'card',
      message: `About ${permanent} permanent tokens, over your ${permanentBudget} target. Every one is re-sent each message, crowding out chat memory.`,
    });
  }

  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Every field as one plain-text block, for pasting into notes or a doc. */
export function janitorFieldsAsText(card: CharacterCard): string {
  const tags = (card.tags || []).filter(Boolean);
  const blocks = toJanitorFields(card).map((f) => `### ${f.label}\n${f.value || '(empty)'}`);
  if (tags.length) blocks.push(`### Tags\n${tags.join(', ')}`);
  return blocks.join('\n\n');
}
