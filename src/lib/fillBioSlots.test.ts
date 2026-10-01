import { afterEach, describe, expect, it, vi } from 'vitest';

import { fillBioSlots, type ApiKeys } from './api';

const KEYS: ApiKeys = { gemini: '', anthropic: 'k', openrouter: '', openai: '', customEndpoint: '', customKey: '' };
const CARD = { name: 'Zane Carter', description: 'A dock foreman.', personality: 'Guarded.', scenario: '', first_mes: '', mes_example: '' };
const SLOTS = [
  { label: 'Tagline', context: '<h1>Zane</h1> ___ Age:' },
  { label: 'Backstory', context: 'History ___' },
];

function mockReply(text: string) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ text }] }) }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock as any).mock.calls[0][1].body).messages[0].content as string;
}

describe('fillBioSlots', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns one value per slot, in order', async () => {
    mockReply('{"s1":"Gruff, but he shows up.","s2":"Raised on the docks."}');
    await expect(fillBioSlots('anthropic', KEYS, CARD, SLOTS)).resolves.toEqual([
      'Gruff, but he shows up.',
      'Raised on the docks.',
    ]);
  });

  it('sends each slot with its surrounding text so the model can size it', async () => {
    const sent = mockReply('{"s1":"a","s2":"b"}');
    await fillBioSlots('anthropic', KEYS, CARD, SLOTS);
    expect(sent()).toContain('s1: "Tagline"');
    expect(sent()).toContain('<h1>Zane</h1> ___ Age:');
    expect(sent()).toContain('Name: Zane Carter');
  });

  it('returns an empty string for a slot the model skipped', async () => {
    mockReply('{"s1":"Only this one."}');
    await expect(fillBioSlots('anthropic', KEYS, CARD, SLOTS)).resolves.toEqual(['Only this one.', '']);
  });

  it('rejects a reply that is not a slot map', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockReply('Sorry, I cannot do that.');
    await expect(fillBioSlots('anthropic', KEYS, CARD, SLOTS)).rejects.toThrow(/fill the bio template/i);
  });

  it('makes no request when there is nothing to fill', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fillBioSlots('anthropic', KEYS, CARD, [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells the model what filler it replaces and which slots share a paragraph', async () => {
    const sent = mockReply('{"s1":"a","s2":"b"}');
    await fillBioSlots('anthropic', KEYS, CARD, [
      { label: 'Lorem ipsum', current: 'Lorem ipsum', context: '___ es un texto', group: 4 },
      { label: 'es un texto', current: 'es un texto de relleno.', context: 'Lorem ipsum ___', group: 4 },
    ]);
    expect(sent()).toContain('s1 [paragraph 4]: replaces "Lorem ipsum"');
    expect(sent()).toContain('s2 [paragraph 4]: replaces "es un texto de relleno."');
    expect(sent()).toMatch(/language of the character card/);
  });
});
