// Feature: flappy-kiro
// Mock-based unit tests for AudioSystem playback resilience (Requirements 3.4,
// 3.5). Audio is non-essential: the jump and game-over effects play through
// preloaded HTMLAudioElements, but when a clip is missing or playback fails
// the game must continue without interruption. These tests inject fake audio
// elements that exercise every failure mode safePlay guards against:
//   - play() returns a rejected promise (autoplay blocked / interrupted),
//   - the element is null (the clip failed to load),
//   - play() (or currentTime assignment) throws synchronously.
// In every case the public playJump/playGameOver methods must not throw and
// must not produce an unhandled promise rejection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem, createAudioSystem } from '../src/adapters/audio.js';

/**
 * Builds a fake HTMLAudioElement whose play() returns a rejected promise.
 * Mirrors a browser blocking autoplay or interrupting playback.
 * @param {Error} [reason] the rejection reason
 */
function rejectingElement(reason = new Error('NotAllowedError')) {
  return {
    currentTime: 123,
    play: vi.fn(() => Promise.reject(reason)),
  };
}

/** Builds a fake audio element whose play() throws synchronously. */
function throwingElement() {
  return {
    currentTime: 0,
    play: vi.fn(() => {
      throw new Error('synchronous play failure');
    }),
  };
}

describe('AudioSystem playback resilience (Requirements 3.4, 3.5)', () => {
  /** @type {Array<{ promise: Promise<unknown>, reason: unknown }>} */
  let unhandled;
  /** @type {(promise: Promise<unknown>, reason: unknown) => void} */
  let unhandledListener;

  beforeEach(() => {
    // Capture any unhandled rejections surfaced during the test so we can
    // assert the adapter attaches a rejection handler to play()'s promise.
    unhandled = [];
    unhandledListener = (reason, promise) => {
      unhandled.push({ promise, reason });
    };
    process.on('unhandledRejection', unhandledListener);
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandledListener);
  });

  /**
   * Gives the microtask queue and one macrotask tick a chance to run so that
   * any unhandled rejection would have been reported by the time we assert.
   */
  async function flushRejections() {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('playJump does not throw when play() returns a rejected promise', async () => {
    const jumpSound = rejectingElement();
    const audio = new AudioSystem({ jumpSound });

    expect(() => audio.playJump()).not.toThrow();
    expect(jumpSound.play).toHaveBeenCalledTimes(1);
    // The clip is rewound before playing so rapid flaps restart it.
    expect(jumpSound.currentTime).toBe(0);

    await flushRejections();
    expect(unhandled).toEqual([]);
  });

  it('playGameOver does not throw when play() returns a rejected promise', async () => {
    const gameOverSound = rejectingElement();
    const audio = new AudioSystem({ gameOverSound });

    expect(() => audio.playGameOver()).not.toThrow();
    expect(gameOverSound.play).toHaveBeenCalledTimes(1);

    await flushRejections();
    expect(unhandled).toEqual([]);
  });

  it('playJump does not throw when the jump element is null', () => {
    const audio = new AudioSystem({ jumpSound: null });
    expect(() => audio.playJump()).not.toThrow();
  });

  it('playGameOver does not throw when the game-over element is null', () => {
    const audio = new AudioSystem({ gameOverSound: null });
    expect(() => audio.playGameOver()).not.toThrow();
  });

  it('both methods no-op safely when constructed with no elements at all', () => {
    const audio = new AudioSystem();
    expect(() => {
      audio.playJump();
      audio.playGameOver();
    }).not.toThrow();
  });

  it('playJump does not throw when play() throws synchronously', () => {
    const jumpSound = throwingElement();
    const audio = new AudioSystem({ jumpSound });

    expect(() => audio.playJump()).not.toThrow();
    expect(jumpSound.play).toHaveBeenCalledTimes(1);
  });

  it('playGameOver does not throw when play() throws synchronously', () => {
    const gameOverSound = throwingElement();
    const audio = new AudioSystem({ gameOverSound });

    expect(() => audio.playGameOver()).not.toThrow();
    expect(gameOverSound.play).toHaveBeenCalledTimes(1);
  });

  it('createAudioSystem builds an instance that tolerates a rejecting clip', async () => {
    const jumpSound = rejectingElement();
    const audio = createAudioSystem({ jumpSound });

    expect(audio).toBeInstanceOf(AudioSystem);
    expect(() => audio.playJump()).not.toThrow();

    await flushRejections();
    expect(unhandled).toEqual([]);
  });

  it('tolerates a play() result that is not promise-like (older browsers)', () => {
    // Some browsers return undefined from play(); safePlay must not assume a
    // promise is returned.
    const jumpSound = { currentTime: 0, play: vi.fn(() => undefined) };
    const audio = new AudioSystem({ jumpSound });

    expect(() => audio.playJump()).not.toThrow();
    expect(jumpSound.play).toHaveBeenCalledTimes(1);
  });
});
