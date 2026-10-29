// Feature: flappy-kiro
// Property-based test for GameLoop delta-time clamping. For any raw delta
// time between two consecutive frames, the delta handed to the tick callback
// equals the smaller of the raw delta and the MAX_DELTA_MS (100 ms) clamp.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GameLoop, MAX_DELTA_MS } from '../src/adapters/gameLoop.js';

const NUM_RUNS = 100;

// The 100 ms per-frame clamp expressed in seconds (Requirement 10.3).
const MAX_DT_SECONDS = MAX_DELTA_MS / 1000;

/**
 * Build a controllable scheduler and clock so the test fully owns when frames
 * fire and what timestamp each frame carries.
 *
 * The scheduler stores the single pending frame callback instead of invoking
 * it, letting the test flush frames one at a time with an explicit timestamp.
 */
function makeHarness() {
  /** @type {((timestampMs: number) => void) | null} */
  let pending = null;
  let nextHandle = 1;

  const requestFrame = (cb) => {
    pending = cb;
    return nextHandle++;
  };

  const cancelFrame = () => {
    pending = null;
  };

  // The loop also falls back to now() when a scheduler supplies no timestamp,
  // but here we always flush frames with an explicit timestamp, so now() is
  // only a safety net.
  const now = () => 0;

  /**
   * Flush the currently pending frame (if any) with the given timestamp.
   * @param {number} timestampMs
   */
  const flush = (timestampMs) => {
    const cb = pending;
    pending = null;
    if (cb) cb(timestampMs);
  };

  return {
    deps: { requestFrame, cancelFrame, now, visibilitySource: null },
    flush,
    hasPending: () => pending !== null,
  };
}

describe('GameLoop long-frame clamping property-based tests', () => {
  // Feature: flappy-kiro, Property 23: Long frames are clamped
  // Validates: Requirements 10.3
  it('dt passed to the tick equals min(rawDelta, 100ms) for any raw delta', () => {
    fc.assert(
      fc.property(
        // Timestamp of the first (baseline) frame, in milliseconds.
        fc.double({
          min: 0,
          max: 1e9,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        // Raw delta time between the baseline frame and the next frame, in ms.
        // Covers deltas both below and above the clamp threshold.
        fc.double({
          min: 0,
          max: 10_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (baseTimestampMs, rawDeltaMs) => {
          const harness = makeHarness();

          /** @type {number[]} */
          const ticks = [];
          const loop = new GameLoop((dt) => ticks.push(dt), harness.deps);

          loop.start();

          // First frame establishes the timing baseline and emits a zero dt.
          harness.flush(baseTimestampMs);
          expect(ticks).toHaveLength(1);
          expect(ticks[0]).toBe(0);

          // Second frame arrives rawDeltaMs later; capture the dt it produces.
          harness.flush(baseTimestampMs + rawDeltaMs);
          expect(ticks).toHaveLength(2);

          const observedDt = ticks[1];
          const rawDeltaSeconds = rawDeltaMs / 1000;
          const expectedDt = Math.min(rawDeltaSeconds, MAX_DT_SECONDS);

          // The delta used for the physics update equals the smaller of the
          // raw delta and the 100 ms clamp.
          expect(observedDt).toBeCloseTo(expectedDt, 9);
          expect(observedDt).toBeLessThanOrEqual(MAX_DT_SECONDS + 1e-9);

          loop.stop();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
