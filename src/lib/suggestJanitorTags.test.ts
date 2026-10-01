import { afterEach, describe, expect, it, vi } from 'vitest';

import { suggestJanitorTags, type ApiKeys } from './api';

const KEYS: ApiKeys = { gemini: '', anthropic: 'k', openrouter: '', openai: '', customEndpoint: '', customKey: '' };
const CARD = {
  name: 'Zane Carter',
  description: 'A grumpy dock foreman.',
  personality: 'Guarded.',
  scenario: '',
  first_mes: '*They step inside.*',
  mes_example: '',
  tags: ['Male'],
};

function mockReply(reply: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ text: typeof reply === 'string' ? reply : JSON.stringify(reply) }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock as any).mock.calls[0][1].body).messages[0].content as string;
}

describe('suggestJanitorTags', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the rating and ranked tags, preserving order and reasons', async () => {
    mockReply({
      rating: 'Limitless',
      rating_reason: 'Romance is central.',
      presets: [{ tag: 'Male', reason: 'He is a man.' }, { tag: 'Angst', reason: 'Grief.' }],
      custom: [{ tag: 'SlowBurn', reason: 'Trust takes time.' }],
    });
    await expect(suggestJanitorTags('anthropic', KEYS, CARD)).resolves.toEqual({
      rating: { tag: 'Limitless', reason: 'Romance is central.' },
      tags: [
        { tag: 'Male', preset: true, reason: 'He is a man.' },
        { tag: 'Angst', preset: true, reason: 'Grief.' },
        { tag: 'SlowBurn', preset: false, reason: 'Trust takes time.' },
      ],
    });
  });

  it('canonicalises preset spelling and demotes invented "presets" to custom tags', async () => {
    mockReply({ rating: 'limitless', presets: [{ tag: 'sci fi' }, { tag: 'Romance' }], custom: [] });
    const { tags } = await suggestJanitorTags('anthropic', KEYS, CARD);
    expect(tags).toEqual([
      { tag: 'Sci-Fi', preset: true, reason: '' },
      { tag: 'Romance', preset: false, reason: '' },
    ]);
  });

  it('coerces custom tags into JanitorAI format and drops what cannot be fixed', async () => {
    mockReply({ rating: 'Limited', presets: [], custom: [{ tag: 'enemies to lovers' }, { tag: 'x' }, { tag: '!!' }] });
    const { tags } = await suggestJanitorTags('anthropic', KEYS, CARD);
    expect(tags.map((t) => t.tag)).toEqual(['EnemiesToLovers']);
  });

  it('removes duplicates across lists and keeps rating tags out of the list', async () => {
    mockReply({
      rating: 'Limited',
      presets: [{ tag: 'Male' }, { tag: 'Limitless' }],
      custom: [{ tag: 'male' }, { tag: 'Mafia' }, { tag: 'mafia' }],
    });
    const { tags } = await suggestJanitorTags('anthropic', KEYS, CARD);
    expect(tags.map((t) => t.tag)).toEqual(['Male', 'Mafia']);
  });

  it('reports no rating rather than guessing one when the reply has none', async () => {
    mockReply({ rating: 'PG-13', presets: [], custom: [] });
    expect((await suggestJanitorTags('anthropic', KEYS, CARD)).rating).toBeNull();
  });

  it('gives the model the preset list, the rules and the existing tags', async () => {
    const sent = mockReply({ rating: 'Limited', presets: [], custom: [] });
    await suggestJanitorTags('anthropic', KEYS, CARD);
    expect(sent()).toContain('- AnyPOV (POV):');
    expect(sent()).toContain('3-21 letters or numbers');
    expect(sent()).toContain('Tags it already has: Male');
    // The rating presets are described separately, not offered as ordinary tags.
    expect(sent()).not.toContain('- Limitless (Rating)');
  });

  it('rejects a reply that is not tag JSON', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockReply('I would tag it as romance.');
    await expect(suggestJanitorTags('anthropic', KEYS, CARD)).rejects.toThrow(/suggest tags/i);
  });
});
