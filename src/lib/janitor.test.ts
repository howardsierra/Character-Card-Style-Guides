import { describe, expect, it } from 'vitest';

import type { CharacterCard } from './parser';
import { estimateTokens, janitorFieldsAsText, janitorTokenBreakdown, lintCard, toJanitorFields } from './janitor';

const OPENER =
  '*Rain hammers the dock lights as {{char}} hauls the last crate inside.* "You picked a bad night to come looking for work," he says, wiping his hands on a rag that only makes them dirtier. ' +
  'He studies the stranger in the doorway for a long moment, weighing the soaked coat and the stubborn set of the jaw, then jerks his chin toward the stove. *There is coffee, bitter and burnt.*';

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    name: 'Zane Carter',
    description: 'A dock foreman.',
    personality: 'Guarded, dryly funny.',
    scenario: '{{user}} arrives looking for work.',
    first_mes: OPENER,
    mes_example: '<START>\n{{user}}: Hi.\n{{char}}: Door sticks. Shove it.',
    creator_notes: 'A grumpy foreman with a soft spot.',
    ...overrides,
  };
}

const ids = (c: CharacterCard, budget = 0) => lintCard(c, budget).map((i) => i.id);

describe('toJanitorFields', () => {
  it('folds description and personality into the single Personality box', () => {
    const p = toJanitorFields(card()).find((f) => f.key === 'personality')!;
    expect(p.value).toBe('A dock foreman.\n\nGuarded, dryly funny.');
  });

  it('does not leave a stray blank line when one half is empty', () => {
    const p = toJanitorFields(card({ personality: '' })).find((f) => f.key === 'personality')!;
    expect(p.value).toBe('A dock foreman.');
  });

  it('takes the public bio from creator_notes', () => {
    expect(toJanitorFields(card()).find((f) => f.key === 'bio')!.value).toBe('A grumpy foreman with a soft spot.');
  });
});

describe('janitorTokenBreakdown', () => {
  it('counts personality, scenario and examples as permanent, the opener as temporary', () => {
    const c = card();
    const b = janitorTokenBreakdown(c);
    const def = toJanitorFields(c).find((f) => f.key === 'personality')!.value;

    expect(b.permanent).toBe(estimateTokens(def) + estimateTokens(c.scenario) + estimateTokens(c.mes_example));
    expect(b.temporary).toBe(estimateTokens(c.first_mes));
  });

  it('charges nothing for the bio, which is never sent to the model', () => {
    const b = janitorTokenBreakdown(card({ creator_notes: 'x'.repeat(4000) }));
    expect(b.byField.bio).toBe(0);
  });
});

describe('lintCard', () => {
  it('passes a well-formed card with no errors or warnings', () => {
    const issues = lintCard(card(), 2000);
    expect(issues.filter((i) => i.severity !== 'tip')).toEqual([]);
  });

  it('flags missing essentials as errors', () => {
    const issues = lintCard(card({ name: '', description: '', personality: '', first_mes: '' }), 0);
    const errors = issues.filter((i) => i.severity === 'error').map((i) => i.id);
    expect(errors).toEqual(expect.arrayContaining(['name-missing', 'personality-missing', 'opener-missing']));
  });

  it.each(['{user}', '<char>', '{{ user }}'])('flags the unsubstituted macro %s', (macro) => {
    expect(ids(card({ scenario: `${macro} walks in.` }))).toContain('macro-malformed-scenario');
  });

  it('does not mistake correct macros for malformed ones', () => {
    expect(ids(card()).some((id) => id.startsWith('macro-'))).toBe(false);
  });

  it('warns on miscased macros', () => {
    expect(ids(card({ scenario: '{{User}} arrives.' }))).toContain('macro-case-scenario');
  });

  it.each([
    '{{user}} nods and steps inside.',
    'You smile and take the coffee.',
  ])('catches an opener that acts for the user: %j', (line) => {
    expect(ids(card({ first_mes: `${OPENER} ${line}` }))).toContain('opener-godmodding');
  });

  it('does not treat the character addressing the user as godmodding', () => {
    // "You picked a bad night" is dialogue aimed at the user, not narration of them.
    expect(ids(card())).not.toContain('opener-godmodding');
  });

  it('ignores second-person verbs inside quoted dialogue', () => {
    expect(ids(card({ first_mes: `${OPENER} "Do you smile at everyone like that?"` }))).not.toContain('opener-godmodding');
  });

  it('spots an unclosed action and an unclosed quote', () => {
    const found = ids(card({ first_mes: `${OPENER} *He turns away. "Well?` }));
    expect(found).toEqual(expect.arrayContaining(['opener-asterisks', 'opener-quotes']));
  });

  it('ignores **bold** when counting action asterisks', () => {
    expect(ids(card({ first_mes: `${OPENER} **Listen.**` }))).not.toContain('opener-asterisks');
  });

  it('notices leftover template placeholders', () => {
    expect(ids(card({ scenario: '[Insert setting here]' }))).toContain('placeholder-scenario');
  });

  it('asks for {{char}}: lines in example dialogs', () => {
    expect(ids(card({ mes_example: 'He grunts a lot.' }))).toContain('examples-format');
  });

  it('warns when permanent tokens exceed the target, and not when no target is set', () => {
    const heavy = card({ description: 'x'.repeat(10000) });
    expect(ids(heavy, 1000)).toContain('over-budget');
    expect(ids(heavy, 0)).not.toContain('over-budget');
  });

  it('orders errors before warnings before tips', () => {
    const order = { error: 0, warning: 1, tip: 2 } as const;
    const sev = lintCard(card({ name: '', scenario: '{user}', mes_example: '' }), 0).map((i) => order[i.severity]);
    expect(sev).toEqual([...sev].sort((a, b) => a - b));
  });
});

describe('janitorFieldsAsText', () => {
  it('labels every field and appends tags', () => {
    const text = janitorFieldsAsText(card({ tags: ['Male', 'Slow Burn'] }));
    expect(text).toContain('### Initial Message');
    expect(text).toContain('### Tags\nMale, Slow Burn');
  });
});
