import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractSlotsFromGuide, extractSlotsFromTemplate, type ApiKeys } from './api';

const KEYS: ApiKeys = {
  gemini: '',
  anthropic: 'test-key',
  openrouter: '',
  openai: '',
  customEndpoint: '',
  customKey: '',
};

const TEMPLATE = `[Basic Information:
* Name:
* Age:
* Occupation: ]
[Core Personality:
* Archetype:
* Traits: ]`;

const EXAMPLE = `[Basic Information:
* Name: Zane Carter
* Age: 34
* Occupation: Dock foreman ]
[Core Personality:
* Archetype: The reluctant protector
* Traits: Guarded, dryly funny ]`;

describe('extractSlotsFromTemplate', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('reads fields from the template without calling the model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const slots = await extractSlotsFromTemplate('anthropic', KEYS, TEMPLATE);

    // "Name" is deliberately absent: it is a dedicated top-level Forge input,
    // not a slot, so the extractor filters it out along with the archetype.
    expect(slots.map((s) => s.name)).toEqual(['Age', 'Occupation', 'Archetype', 'Traits']);
    // The regex path is the whole point: no network round trip.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('borrows descriptions from the filled example', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const slots = await extractSlotsFromTemplate('anthropic', KEYS, TEMPLATE, undefined, EXAMPLE);
    const archetype = slots.find((s) => s.name === 'Archetype');

    expect(archetype?.description).toContain('The reluctant protector');
  });

  it('does not turn example prose into extra fields', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const slots = await extractSlotsFromTemplate('anthropic', KEYS, TEMPLATE, undefined, EXAMPLE);

    // Only the template defines the field set; the example just enriches it.
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.name)).not.toContain('Zane Carter');
  });

  // A template the regex cannot read falls back to the model. That call is
  // wrapped internally, so a provider outage degrades to a minimal usable field
  // set rather than rejecting and leaving the Forge with nothing to render.
  it('degrades to a fallback field set when the model call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'invalid x-api-key' } }),
      })) as unknown as typeof fetch
    );

    const slots = await extractSlotsFromTemplate(
      'anthropic',
      KEYS,
      'prose with no field markers at all'
    );

    expect(slots.map((s) => s.name)).toEqual(['Background', 'Scenario']);
  });
});

describe('extractSlotsFromGuide', () => {
  it('returns a stable, non-empty field set', () => {
    const slots = extractSlotsFromGuide();

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => typeof s.name === 'string' && s.name.length > 0)).toBe(true);
  });

  it('has no duplicate field names', () => {
    const names = extractSlotsFromGuide().map((s) => s.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
