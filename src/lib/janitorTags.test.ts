import { describe, expect, it } from 'vitest';

import { MAX_TAGS, PRESET_TAGS, findPreset, normalizeTag, toCustomTag, validateJanitorTags } from './janitorTags';

describe('findPreset', () => {
  it('matches presets case-insensitively and returns the canonical name', () => {
    expect(findPreset('limitless')?.name).toBe('Limitless');
    expect(findPreset('  MALE ')?.name).toBe('Male');
  });

  it('matches presets typed without their punctuation or spacing', () => {
    expect(findPreset('scifi')?.name).toBe('Sci-Fi');
    expect(findPreset('dead dove')?.name).toBe('Dead Dove');
    expect(findPreset('Any POV')?.name).toBe('AnyPOV');
  });

  it('returns nothing for tags that are not presets', () => {
    expect(findPreset('SlowBurn')).toBeUndefined();
  });

  it('has no duplicate preset names', () => {
    const names = PRESET_TAGS.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('toCustomTag', () => {
  it.each([
    ['Slow Burn', 'SlowBurn'],
    ['enemies-to-lovers', 'EnemiesToLovers'],
    ['café', 'cafe'],
    ['Mafia', 'Mafia'],
  ])('turns %j into %j', (raw, expected) => {
    expect(toCustomTag(raw)).toBe(expected);
  });

  it('rejects what cannot be made valid', () => {
    expect(toCustomTag('ok')).toBeNull(); // under 3
    expect(toCustomTag('a'.repeat(22))).toBeNull(); // over 21
    expect(toCustomTag('💔!!')).toBeNull();
  });
});

describe('normalizeTag', () => {
  it('prefers the preset over a custom spelling', () => {
    expect(normalizeTag('sci fi')).toBe('Sci-Fi');
    expect(normalizeTag('slow burn')).toBe('SlowBurn');
  });
});

describe('validateJanitorTags', () => {
  const messages = (tags: string[]) => validateJanitorTags(tags).map((p) => `${p.severity}: ${p.message}`);

  it('accepts a valid set', () => {
    expect(validateJanitorTags(['Limitless', 'Male', 'Angst', 'SlowBurn'])).toEqual([]);
  });

  it('requires a rating tag', () => {
    expect(messages(['Male'])[0]).toMatch(/^error: .*Limited.*Limitless/);
  });

  it('warns when both ratings are set', () => {
    expect(messages(['Limited', 'Limitless']).some((m) => m.startsWith('warning'))).toBe(true);
  });

  it(`enforces the ${MAX_TAGS}-tag limit`, () => {
    const tags = ['Limitless', ...Array.from({ length: MAX_TAGS }, (_, i) => `Custom${i}`)];
    expect(messages(tags).some((m) => /at most 10/.test(m))).toBe(true);
  });

  it('flags custom tags JanitorAI would reject, but not presets with punctuation', () => {
    const found = messages(['Limitless', 'Sci-Fi', 'Movies & TV', 'slow burn']);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('"slow burn"');
  });

  it('warns about AnyPOV mixed with a specific POV', () => {
    expect(messages(['Limited', 'AnyPOV', 'FemalePOV']).some((m) => /mixed signals/.test(m))).toBe(true);
  });
});
