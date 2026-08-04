import { describe, expect, it, vi } from 'vitest';

import { parseJsonObject } from './api';

describe('parseJsonObject', () => {
  it('returns a well-formed object unchanged', () => {
    expect(parseJsonObject('{"name":"Zane","age":34}', 'Test')).toEqual({ name: 'Zane', age: 34 });
  });

  it('repairs a fenced reply with a trailing comma', () => {
    expect(parseJsonObject('```json\n{"name":"Zane",}\n```', 'Test')).toEqual({ name: 'Zane' });
  });

  // jsonrepair turns bare prose into a valid JSON string literal, so parsing
  // succeeds and a string used to flow onward as if it were an object.
  it.each([
    'I cannot help with that request.',
    'Sorry!',
  ])('rejects prose rather than returning it (%j)', (prose) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject(prose, 'Test')).toThrow(/replied with something else/i);
  });

  it('rejects a top-level array', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject('["a","b"]', 'Test')).toThrow(/replied with something else/i);
  });

  it('rejects null', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject('null', 'Test')).toThrow(/replied with something else/i);
  });

  it('accepts an object carrying at least one required key', () => {
    expect(parseJsonObject('{"nodes":[]}', 'Test', ['nodes', 'links'])).toEqual({ nodes: [] });
  });

  it('rejects an object carrying none of the required keys', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject('{"unrelated":1}', 'Test', ['nodes', 'links'])).toThrow(
      /replied with something else/i
    );
  });

  it('prefixes the failure with the caller-supplied subject', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject('nope', 'Failed to adapt the card')).toThrow(
      /^Failed to adapt the card:/
    );
  });

  it('includes a preview of what the model actually said', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseJsonObject('I refuse to do that', 'Test')).toThrow(/I refuse to do that/);
  });
});
