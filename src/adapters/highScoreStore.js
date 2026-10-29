// Feature: flappy-kiro
// HighScoreStore browser adapter. Persists the all-time high score in
// localStorage under a single key so the pure simulation core never touches
// platform storage directly (Requirements 8.3, 8.4).
//
// Reads tolerate a missing or malformed value by defaulting to 0, and writes
// are wrapped so a storage quota/availability error never crashes the game;
// the session simply runs without persistence in that case.

/** Storage key holding the stringified non-negative integer high score. */
export const HIGH_SCORE_KEY = 'flappy-kiro.highScore';

/**
 * Resolves the `localStorage`-like object to use. Prefers an injected store
 * (for testing), then the global `localStorage`, and otherwise `null` when no
 * storage is available (e.g. a privacy mode that throws on access).
 * @param {Storage | undefined} injected
 * @returns {Storage | null}
 */
function resolveStorage(injected) {
  if (injected) {
    return injected;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Accessing `localStorage` can itself throw in some sandboxed contexts.
  }
  return null;
}

/**
 * Parses a raw stored value into a non-negative integer, returning 0 when the
 * value is missing or malformed (null, non-numeric, negative, fractional, or
 * out of range).
 * @param {string | null | undefined} raw
 * @returns {number}
 */
function parseHighScore(raw) {
  if (raw === null || raw === undefined) {
    return 0;
  }
  // `Number` (not `parseInt`) so trailing garbage like "12abc" is rejected.
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

/**
 * Persists the all-time high score in localStorage. Reads default to 0 for a
 * missing or malformed value; writes swallow storage errors.
 */
export class HighScoreStore {
  /**
   * @param {object} [options]
   * @param {Storage} [options.storage] A `localStorage`-compatible object.
   *   Defaults to the global `localStorage` when available.
   * @param {string} [options.key] Storage key. Defaults to
   *   `flappy-kiro.highScore`.
   */
  constructor({ storage, key = HIGH_SCORE_KEY } = {}) {
    /** @type {Storage | null} */
    this._storage = resolveStorage(storage);
    /** @type {string} */
    this._key = key;
  }

  /**
   * Reads the stored high score, returning 0 when the key is missing, the
   * value is malformed, or storage access throws.
   * @returns {number} a non-negative integer
   */
  get() {
    if (!this._storage) {
      return 0;
    }
    try {
      return parseHighScore(this._storage.getItem(this._key));
    } catch {
      return 0;
    }
  }

  /**
   * Persists a new high score. Non-integer or negative inputs are ignored, and
   * any storage error (quota, availability) is swallowed so the game is never
   * interrupted.
   * @param {number} score a non-negative integer
   * @returns {void}
   */
  set(score) {
    if (!this._storage) {
      return;
    }
    if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
      return;
    }
    try {
      this._storage.setItem(this._key, String(score));
    } catch {
      // Storage quota/availability error: run without persistence.
    }
  }
}

/**
 * Factory helper mirroring the other modules' `create*` style.
 * @param {ConstructorParameters<typeof HighScoreStore>[0]} [options]
 * @returns {HighScoreStore}
 */
export function createHighScoreStore(options) {
  return new HighScoreStore(options);
}
