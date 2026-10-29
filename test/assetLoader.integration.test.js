// Feature: flappy-kiro
// Integration tests for the AssetLoader adapter's loading paths (Requirements
// 1.1, 1.2, 9.2). These exercise the public load(deadlineMs) API end-to-end
// through fake Image/Audio element stubs and a controllable timer so we can
// drive load/error events and the deadline deterministically without a browser.
//
// Covered paths:
//  1. Successful load within the deadline resolves with a fully-populated
//     LoadedAssets bundle and cancels the deadline timer (Req 1.1).
//  2. Deadline exceeded (no asset settles in time) rejects (Req 1.2).
//  3. A sprite that fails to load still resolves, surfacing that field as null
//     so the Renderer can fall back to a placeholder (Req 9.2).

import { describe, it, expect, vi } from 'vitest';
import {
  AssetLoader,
  GHOST_SRC,
  COLLECTIBLE_SRC,
  JUMP_SOUND_SRC,
  GAME_OVER_SOUND_SRC,
} from '../src/adapters/assetLoader.js';

/**
 * A fake browser Image element. It records the assigned `src` and exposes
 * onload/onerror callbacks (matching the loader's image-loading path) so a test
 * can decide, per-src, whether the load succeeds or fails.
 */
class FakeImage {
  constructor() {
    /** @type {null | (() => void)} */
    this.onload = null;
    /** @type {null | (() => void)} */
    this.onerror = null;
    this._src = '';
  }
  set src(value) {
    this._src = value;
    // Defer firing so the loader has wired up onload/onerror, mirroring how a
    // real browser dispatches load events asynchronously after src assignment.
    queueMicrotask(() => {
      if (FAILING_SRCS.has(value)) {
        this.onerror && this.onerror();
      } else if (!STALLED_SRCS.has(value)) {
        this.onload && this.onload();
      }
      // A stalled src never fires either callback (used for the deadline path).
    });
  }
  get src() {
    return this._src;
  }
}

/**
 * A fake browser Audio element covering the addEventListener-based ready/error
 * path the loader uses (`canplaythrough`/`loadeddata` to resolve, `error` to
 * reject). Successful srcs dispatch `canplaythrough`; failing srcs dispatch
 * `error`; stalled srcs dispatch nothing.
 */
class FakeAudio {
  constructor() {
    /** @type {Map<string, Array<() => void>>} */
    this._listeners = new Map();
    this.preload = '';
    this._src = '';
  }
  addEventListener(type, cb) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(cb);
  }
  _emit(type) {
    const cbs = this._listeners.get(type) ?? [];
    for (const cb of cbs) cb();
  }
  load() {
    // No-op; buffering is simulated by the src setter below.
  }
  set src(value) {
    this._src = value;
    queueMicrotask(() => {
      if (FAILING_SRCS.has(value)) {
        this._emit('error');
      } else if (!STALLED_SRCS.has(value)) {
        this._emit('canplaythrough');
      }
    });
  }
  get src() {
    return this._src;
  }
}

// Per-test control sets consulted by the fake elements. They are reset before
// each test so src-specific behavior is scoped to a single test.
/** @type {Set<string>} */
let FAILING_SRCS = new Set();
/** @type {Set<string>} */
let STALLED_SRCS = new Set();

/**
 * A controllable timer standing in for setTimeout/clearTimeout. The scheduled
 * deadline callback only fires when the test explicitly calls `trigger()`, so
 * the race between asset loads and the deadline is fully deterministic.
 */
function createControllableTimer() {
  const timers = new Map();
  let nextHandle = 1;
  return {
    setTimer: vi.fn((cb, ms) => {
      const handle = nextHandle++;
      timers.set(handle, { cb, ms });
      return handle;
    }),
    clearTimer: vi.fn((handle) => {
      timers.delete(handle);
    }),
    /** Fire every timer that is still scheduled (the deadline elapsed). */
    trigger() {
      for (const { cb } of timers.values()) cb();
    },
    /** Number of timers still scheduled (0 means the deadline was cleared). */
    get pending() {
      return timers.size;
    },
  };
}

/**
 * Build an AssetLoader wired to the fake elements and the given controllable
 * timer.
 * @param {ReturnType<typeof createControllableTimer>} timer
 */
function buildLoader(timer) {
  return new AssetLoader({
    createImage: () => new FakeImage(),
    createAudio: () => new FakeAudio(),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
}

describe('AssetLoader integration — loading paths', () => {
  beforeEach(() => {
    FAILING_SRCS = new Set();
    STALLED_SRCS = new Set();
  });

  it('resolves with a fully-populated bundle when all assets load within the deadline (Req 1.1)', async () => {
    const timer = createControllableTimer();
    const loader = buildLoader(timer);

    const assets = await loader.load(5000);

    // Every asset loaded, so no field is null.
    expect(assets.ghost).toBeInstanceOf(FakeImage);
    expect(assets.collectible).toBeInstanceOf(FakeImage);
    expect(assets.jumpSound).toBeInstanceOf(FakeAudio);
    expect(assets.gameOverSound).toBeInstanceOf(FakeAudio);

    // The correct srcs were requested.
    expect(assets.ghost.src).toBe(GHOST_SRC);
    expect(assets.collectible.src).toBe(COLLECTIBLE_SRC);
    expect(assets.jumpSound.src).toBe(JUMP_SOUND_SRC);
    expect(assets.gameOverSound.src).toBe(GAME_OVER_SOUND_SRC);

    // The deadline was scheduled with the supplied value and then cancelled on
    // success, so no stray timer remains.
    expect(timer.setTimer).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(timer.clearTimer).toHaveBeenCalledTimes(1);
    expect(timer.pending).toBe(0);
  });

  it('rejects when the deadline elapses before assets settle (Req 1.2)', async () => {
    const timer = createControllableTimer();
    // Stall every asset so the only thing that can settle the load is the
    // deadline firing.
    STALLED_SRCS = new Set([
      GHOST_SRC,
      COLLECTIBLE_SRC,
      JUMP_SOUND_SRC,
      GAME_OVER_SOUND_SRC,
    ]);
    const loader = buildLoader(timer);

    const loadPromise = loader.load(5000);
    const assertion = expect(loadPromise).rejects.toThrow(/5000ms deadline/);

    // Nothing has resolved; fire the deadline to force a timeout rejection.
    timer.trigger();

    await assertion;
  });

  it('resolves with a null field for a sprite that fails to load (Req 9.2)', async () => {
    const timer = createControllableTimer();
    // The ghost sprite fails to decode; everything else loads normally.
    FAILING_SRCS = new Set([GHOST_SRC]);
    const loader = buildLoader(timer);

    const assets = await loader.load(5000);

    // The failed sprite is surfaced as null (placeholder-capable), while the
    // rest of the bundle is intact — the overall load still resolves.
    expect(assets.ghost).toBeNull();
    expect(assets.collectible).toBeInstanceOf(FakeImage);
    expect(assets.jumpSound).toBeInstanceOf(FakeAudio);
    expect(assets.gameOverSound).toBeInstanceOf(FakeAudio);

    // A per-asset failure must not leave the deadline timer dangling.
    expect(timer.clearTimer).toHaveBeenCalledTimes(1);
    expect(timer.pending).toBe(0);
  });
});
