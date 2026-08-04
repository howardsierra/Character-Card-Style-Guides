import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateCharacterCard, type ApiKeys } from './api';

const KEYS: ApiKeys = {
  gemini: '',
  anthropic: 'test-key',
  openrouter: '',
  openai: '',
  customEndpoint: '',
  customKey: '',
};

const CARD = {
  name: 'Test',
  description: 'd',
  personality: 'p',
  scenario: 's',
  first_mes: 'f',
  mes_example: 'm',
};

/** Mock Anthropic and hand back the prompt the provider was called with. */
function mockProvider(responseText = JSON.stringify(CARD)) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ text: responseText }] }),
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return {
    sentPrompt: () => {
      const body = JSON.parse((fetchMock as any).mock.calls[0][1].body);
      return body.messages[0].content as string;
    },
  };
}

const generate = (tokenLimit?: number) =>
  generateCharacterCard(
    'anthropic',
    KEYS,
    'style guide text',
    [{ name: 'Name', value: 'Test' }],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    tokenLimit
  );

describe('generateCharacterCard token limit', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('states the budget in the prompt when a limit is set', async () => {
    const p = mockProvider();
    await generate(800);

    const prompt = p.sentPrompt();
    expect(prompt).toContain('TOKEN LIMIT CONSTRAINT');
    expect(prompt).toContain('800 tokens');
    // The character estimate should follow from the token count.
    expect(prompt).toContain('3200 characters');
  });

  it.each([
    ['omitted', undefined],
    ['zero', 0],
    ['negative', -500],
  ])('adds no constraint when the limit is %s', async (_label, limit) => {
    const p = mockProvider();
    await generate(limit as number | undefined);

    expect(p.sentPrompt()).not.toContain('TOKEN LIMIT CONSTRAINT');
  });

  it('still returns a parsed card when a limit is applied', async () => {
    mockProvider();
    await expect(generate(1200)).resolves.toMatchObject({ name: 'Test' });
  });

  it('recovers a card from a fenced, slightly malformed JSON reply', async () => {
    // Models routinely wrap JSON in a code fence and leave a trailing comma.
    mockProvider('```json\n{"name":"Frayed","description":"d",}\n```');

    await expect(generate()).resolves.toMatchObject({ name: 'Frayed' });
  });

  // jsonrepair coerces bare prose into a JSON string literal, so parsing
  // succeeds and a plain string used to reach the UI as a "card", rendering
  // every field blank with no error.
  it('rejects a prose reply instead of returning it as a card', async () => {
    mockProvider('I cannot help with that request.');

    await expect(generate()).rejects.toThrow(/did not return a character card/i);
  });

  it('rejects a JSON reply that is not card-shaped', async () => {
    mockProvider('["not", "a", "card"]');

    await expect(generate()).rejects.toThrow(/did not return a character card/i);
  });
});
