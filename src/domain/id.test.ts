import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

afterEach(() => vi.unstubAllGlobals());
describe('UUID compatibility', () => {
  it('uses native randomUUID when available', () => {
    const native = vi.fn(() => 'native-uuid');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(createId()).toBe('native-uuid');
    expect(native).toHaveBeenCalledOnce();
  });
  it('uses getRandomValues without randomUUID, preserving UUID v4 version and variant', () => {
    const crypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 1000 }, createId);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('fails explicitly when no cryptographic randomness is available', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createId).toThrow('crypto.getRandomValues');
  });
});
