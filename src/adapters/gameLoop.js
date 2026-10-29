// Feature: flappy-kiro
// GameLoop adapter: wraps requestAnimationFrame to drive the simulation once
// per browser animation frame. It computes the delta time between frames,
// clamps long frames so a single stall cannot cause a position jump, and
// pauses/resumes via the Page Visibility API without applying the elapsed
// time accumulated while the tab was hidden.
//
// This is a side-effecting adapter (it talks to the browser's rAF scheduler,
// clock, and document). To keep it testable without a real browser, every
// environment dependency (the frame scheduler, the clock, and the document)
// can be injected; the defaults wire up the real browser globals.

/**
 * The maximum delta time, in milliseconds, handed to a single tick. If more
 * than this much wall-clock time elapsed between two consecutive frames (for
 * example after a stall), the delta is clamped to this value so object
 * positions do not jump beyond roughly one frame's worth of movement.
 * @type {number}
 */
export const MAX_DELTA_MS = 100;

/**
 * A function invoked once per animation frame with the (clamped) elapsed time.
 * @callback TickCallback
 * @param {number} dtSeconds elapsed time since the previous frame, in seconds,
 *   clamped to {@link MAX_DELTA_MS} and never negative
 * @returns {void}
 */

/**
 * @typedef {Object} GameLoopDeps
 * @property {(cb: (timestampMs: number) => void) => number} [requestFrame]
 *   schedules a callback for the next animation frame; returns a handle.
 *   Defaults to `requestAnimationFrame` bound to the global scope.
 * @property {(handle: number) => void} [cancelFrame]
 *   cancels a previously scheduled frame. Defaults to `cancelAnimationFrame`.
 * @property {() => number} [now]
 *   returns a monotonic timestamp in milliseconds. Defaults to
 *   `performance.now()` when available, otherwise `Date.now()`.
 * @property {Document | EventTarget | null} [visibilitySource]
 *   the object that emits `visibilitychange` events and exposes a `hidden`
 *   flag (normally `document`). Defaults to the global `document` when
 *   available; pass `null` to disable automatic visibility handling.
 */

/**
 * Resolve the default frame scheduler, cancel function, clock, and visibility
 * source from the ambient browser globals, falling back to safe no-ops when a
 * global is unavailable (for example under a non-browser test runner).
 * @returns {Required<Omit<GameLoopDeps, 'visibilitySource'>> & { visibilitySource: GameLoopDeps['visibilitySource'] }}
 */
function resolveDefaults() {
  const g = /** @type {any} */ (globalThis);

  const requestFrame =
    typeof g.requestAnimationFrame === 'function'
      ? g.requestAnimationFrame.bind(g)
      : (/** @type {(t: number) => void} */ cb) =>
          g.setTimeout(() => cb(defaultNow()), 16);

  const cancelFrame =
    typeof g.cancelAnimationFrame === 'function'
      ? g.cancelAnimationFrame.bind(g)
      : (/** @type {number} */ handle) => g.clearTimeout(handle);

  const now = defaultNow;

  const visibilitySource =
    typeof g.document !== 'undefined' ? g.document : null;

  return { requestFrame, cancelFrame, now, visibilitySource };
}

/**
 * Default monotonic clock: prefers `performance.now()` for sub-millisecond,
 * monotonic timestamps and falls back to `Date.now()`.
 * @returns {number} milliseconds
 */
function defaultNow() {
  const g = /** @type {any} */ (globalThis);
  if (g.performance && typeof g.performance.now === 'function') {
    return g.performance.now();
  }
  return Date.now();
}

/**
 * Drives a tick callback once per animation frame using delta-time timing.
 *
 * Timing rules (Requirement 10):
 * - One tick per animation frame (10.1).
 * - The tick receives the elapsed seconds since the previous frame so movement
 *   can be scaled by real time (10.2).
 * - Elapsed time above {@link MAX_DELTA_MS} is clamped before the tick (10.3).
 * - When the tab becomes hidden (or rendering is suspended) the loop stops
 *   advancing; on resume timing is re-based to the current timestamp so the
 *   time spent hidden is not applied as one giant delta (10.4).
 */
export class GameLoop {
  /**
   * @param {TickCallback} onTick invoked once per frame with the clamped
   *   delta time in seconds
   * @param {GameLoopDeps} [deps] injectable environment dependencies
   */
  constructor(onTick, deps = {}) {
    if (typeof onTick !== 'function') {
      throw new TypeError('GameLoop requires an onTick callback');
    }

    const defaults = resolveDefaults();

    /** @type {TickCallback} */
    this._onTick = onTick;
    /** @type {(cb: (timestampMs: number) => void) => number} */
    this._requestFrame = deps.requestFrame ?? defaults.requestFrame;
    /** @type {(handle: number) => void} */
    this._cancelFrame = deps.cancelFrame ?? defaults.cancelFrame;
    /** @type {() => number} */
    this._now = deps.now ?? defaults.now;
    /** @type {Document | EventTarget | null} */
    this._visibilitySource =
      deps.visibilitySource !== undefined
        ? deps.visibilitySource
        : defaults.visibilitySource;

    /**
     * True while the loop is running (between start() and stop()).
     * @type {boolean}
     */
    this._running = false;
    /**
     * True while physics is suspended because the tab is hidden.
     * @type {boolean}
     */
    this._paused = false;
    /**
     * Handle for the currently scheduled frame, or null when none is pending.
     * @type {number | null}
     */
    this._frameHandle = null;
    /**
     * Timestamp (ms) of the previous frame, or null when timing needs to be
     * re-based on the next frame (initial start and every resume).
     * @type {number | null}
     */
    this._lastTimestamp = null;

    // Bind the listener once so it can be added and removed symmetrically.
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._frameCallback = this._frame.bind(this);
  }

  /** @returns {boolean} true while the loop is running */
  get running() {
    return this._running;
  }

  /** @returns {boolean} true while the loop is paused due to tab visibility */
  get paused() {
    return this._paused;
  }

  /**
   * Start the loop. Timing is re-based on the first frame, so the first tick
   * receives a zero delta rather than the time since construction. Starting an
   * already-running loop is a no-op.
   * @returns {void}
   */
  start() {
    if (this._running) return;

    this._running = true;
    // Re-base timing on the next frame.
    this._lastTimestamp = null;

    this._subscribeVisibility();

    // If the tab is already hidden when we start, remain paused until it
    // becomes visible again instead of scheduling frames that cannot tick.
    this._paused = this._isHidden();
    if (!this._paused) {
      this._scheduleFrame();
    }
  }

  /**
   * Stop the loop entirely, cancel any pending frame, and detach the
   * visibility listener. Safe to call when already stopped.
   * @returns {void}
   */
  stop() {
    if (!this._running) return;

    this._running = false;
    this._paused = false;
    this._lastTimestamp = null;

    if (this._frameHandle !== null) {
      this._cancelFrame(this._frameHandle);
      this._frameHandle = null;
    }

    this._unsubscribeVisibility();
  }

  /**
   * Explicitly drive the pause/resume behavior, independent of the Page
   * Visibility API. Useful for orchestrators that observe visibility
   * themselves, and for tests. Pausing stops frames from advancing physics;
   * resuming re-bases timing so no accumulated elapsed time is applied.
   * @param {boolean} visible whether the game is currently visible
   * @returns {void}
   */
  setVisible(visible) {
    if (visible) {
      this._resume();
    } else {
      this._pause();
    }
  }

  // --- internals ---------------------------------------------------------

  /**
   * The per-frame driver. Computes the clamped delta time, invokes the tick,
   * and schedules the next frame while running and not paused.
   * @param {number} [timestampMs] the frame timestamp supplied by rAF
   * @returns {void}
   */
  _frame(timestampMs) {
    this._frameHandle = null;

    if (!this._running || this._paused) {
      return;
    }

    // rAF passes a timestamp, but injected/fallback schedulers may not; fall
    // back to the clock so timing is always well defined.
    const current =
      typeof timestampMs === 'number' ? timestampMs : this._now();

    if (this._lastTimestamp === null) {
      // First frame after start or resume: establish the baseline and emit a
      // zero delta so the elapsed hidden/pre-start time is never applied.
      this._lastTimestamp = current;
      this._onTick(0);
    } else {
      let deltaMs = current - this._lastTimestamp;
      this._lastTimestamp = current;

      // Guard against non-monotonic clocks producing a negative delta.
      if (deltaMs < 0) deltaMs = 0;
      // Clamp long frames so a single stall cannot cause a position jump.
      if (deltaMs > MAX_DELTA_MS) deltaMs = MAX_DELTA_MS;

      this._onTick(deltaMs / 1000);
    }

    // Schedule the next frame if we are still running and visible.
    if (this._running && !this._paused) {
      this._scheduleFrame();
    }
  }

  /**
   * Schedule the next animation frame if one is not already pending.
   * @returns {void}
   */
  _scheduleFrame() {
    if (this._frameHandle !== null) return;
    this._frameHandle = this._requestFrame(this._frameCallback);
  }

  /**
   * Suspend physics updates. Cancels the pending frame and forgets the last
   * timestamp so the next resume re-bases timing.
   * @returns {void}
   */
  _pause() {
    if (!this._running || this._paused) return;

    this._paused = true;
    this._lastTimestamp = null;

    if (this._frameHandle !== null) {
      this._cancelFrame(this._frameHandle);
      this._frameHandle = null;
    }
  }

  /**
   * Resume physics updates from the current timestamp. Because the last
   * timestamp was cleared on pause, the first resumed frame emits a zero delta
   * and no time accumulated while hidden is applied.
   * @returns {void}
   */
  _resume() {
    if (!this._running || !this._paused) return;

    this._paused = false;
    this._lastTimestamp = null;
    this._scheduleFrame();
  }

  /**
   * Handler for the document's `visibilitychange` event. Pauses when hidden
   * and resumes when visible.
   * @returns {void}
   */
  _handleVisibilityChange() {
    if (this._isHidden()) {
      this._pause();
    } else {
      this._resume();
    }
  }

  /**
   * Whether the visibility source currently reports the page as hidden.
   * @returns {boolean}
   */
  _isHidden() {
    const src = /** @type {any} */ (this._visibilitySource);
    return Boolean(src && src.hidden);
  }

  /**
   * Attach the `visibilitychange` listener to the visibility source, if one is
   * available and supports event subscription.
   * @returns {void}
   */
  _subscribeVisibility() {
    const src = /** @type {any} */ (this._visibilitySource);
    if (src && typeof src.addEventListener === 'function') {
      src.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  /**
   * Detach the `visibilitychange` listener from the visibility source.
   * @returns {void}
   */
  _unsubscribeVisibility() {
    const src = /** @type {any} */ (this._visibilitySource);
    if (src && typeof src.removeEventListener === 'function') {
      src.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }
}

/**
 * Factory helper mirroring the other modules' `create*` style.
 * @param {TickCallback} onTick invoked once per frame with the clamped delta
 *   time in seconds
 * @param {GameLoopDeps} [deps] injectable environment dependencies
 * @returns {GameLoop}
 */
export function createGameLoop(onTick, deps = {}) {
  return new GameLoop(onTick, deps);
}
