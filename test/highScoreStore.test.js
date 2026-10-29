// Feature: flappy-kiro
// Mock-based tests for the HighScoreStore adapter (Requirements 8.3, 8.4).
// A minimal in-memory localStorage mock stands in for the browser platform so
// we can verify read/write round-trips, the fallback to 0 on missing or
// malformed values, and that write/read errors are tolerated.

import { describe, it, expect, vi } from 'vitest';
import {
  HighScoreStore,
  createHighScoreStore,
  HIGH_SCORE_KEY,
} from '../src/adapters/highScoreStore.js';

/**
 * Builds a minimal localStorage-compatible mock backed by a Map. Only the
 * methods the store uses (`getItem`, `setItem`) are implemented.
 * @param {Record<string, string>} [initial] seed key/value pairs
 */
function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((key) => (map.has(key) ? map.get(key) : null)),
    setItem: vi.fn((key, value) => {
      map.set(key, String(value));
    }),
  };
}

describe('HighScoreStore', () => {
  it('round-trips a score through set() and get()', () => {
    const storage = createMockStorage();
    const store = new HighScoreStore({ storage });

    store.set(42);

    expect(storage.setItem).toHaveBeenCalledWith(HIGH_SCORE_KEY, '42');
    expect(store.get()).toBe(42);
  });

  it('persists under the flappy-kiro.highScore key', () => {
    const storage = createMockStorage();
    const store = new HighScoreStore({ storage });

    store.set(7);

    expect(storage.map.get('flappy-kiro.highScore')).toBe('7');
    expect(HIGH_SCORE_KEY).toBe('flappy-kiro.highScore');
  });

  it('reflects the latest value when set() is called repeatedly', () => {
    const storage = createMockStorage();
    const store = new HighScoreStore({ storage });

    store.set(3);
    store.set(10);

    expect(store.get()).toBe(10);
  });

  it('returns 0 when the stored value is missing', () => {
    const storage = createMockStorage();
    const store = new HighScoreStore({ storage });

    expect(store.get()).toBe(0);
  });

  it('returns 0 for a malformed (non-numeric) stored value', () => {
    const storage = createMockStorage({ [HIGH_SCORE_KEY]: 'not-a-number' });
    const store = new HighScoreStore({ storage });

    expect(store.get()).toBe(0);
  });

  it('returns 0 for a partially numeric stored value', () => {
    const storage = createMockStorage({ [HIGH_SCORE_KEY]: '12abc' });
    const store = new HighScoreStore({ storage });

    expect(store.get()).toBe(0);
  });

  it('returns 0 for a negative or fractional stored value', () => {
    const negative = new HighScoreStore({
      storage: createMockStorage({ [HIGH_SCORE_KEY]: '-5' }),
    });
    const fractional = new HighScoreStore({
      storage: createMockStorage({ [HIGH_SCORE_KEY]: '3.5' }),
    });

    expect(negative.get()).toBe(0);
    expect(fractional.get()).toBe(0);
  });

  it('reads a valid stored value written by a prior session', () => {
    const storage = createMockStorage({ [HIGH_SCORE_KEY]: '128' });
    const store = new HighScoreStore({ storage });

    expect(store.get()).toBe(128);
  });

  it('tolerates a setItem error without throwing', () => {
    const storage = createMockStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError');
    });
    const store = new HighScoreStore({ storage });

    expect(() => store.set(99)).not.toThrow();
  });

  it('tolerates a getItem error by returning 0', () => {
    const storage = createMockStorage();
    storage.getItem = vi.fn(() => {
      throw new Error('SecurityError');
    });
    const store = new HighScoreStore({ storage });

    expect(store.get()).toBe(0);
  });

  it('returns 0 and ignores writes when no storage is available', () => {
    const store = new HighScoreStore({ storage: null });

    expect(() => store.set(50)).not.toThrow();
    expect(store.get()).toBe(0);
  });

  it('ignores invalid scores passed to set()', () => {
    const storage = createMockStorage();
    const store = new HighScoreStore({ storage });

    store.set(-1);
    store.set(1.5);
    store.set(Number.NaN);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.get()).toBe(0);
  });

  it('createHighScoreStore builds an equivalent instance', () => {
    const storage = createMockStorage();
    const store = createHighScoreStore({ storage });

    store.set(5);

    expect(store).toBeInstanceOf(HighScoreStore);
    expect(store.get()).toBe(5);
  });
});
