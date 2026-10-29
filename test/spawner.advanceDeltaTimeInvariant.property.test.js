// Feature: flappy-kiro
// Property-based test for spawner.advance: horizontal scrolling is
// delta-time invariant. The total displacement over a fixed interval T is
// scrollSpeed * T regardless of how T is partitioned into sub-frames (each
// delta time at most the 100 ms clamp).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { advance } from '../src/core/spawner.js';
import {
  createPipePair,
  createCollectible,
  createPlayfield,
  createDefaultConfig,
} from '../src/core/models.js';

const NUM_RUNS = 100;

// The 100 ms per-frame clamp (seconds) from Requirement 10.3 / GameLoop.
const MAX_DT = 0.1;

/**
 * Partition a total interval T into consecutive sub-frames, each <= MAX_DT.
 * `weights` are positive samples that set the relative size of each frame;
 * they are normalized so the frames sum to exactly T (up to float error) and
 * then each is capped at MAX_DT by splitting oversized frames. Returns a list
 * of deltas whose sum ~= T, every entry <= MAX_DT.
 */
function partition(T, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  // Scale weights to sum to T.
  const scaled = weights.map((w) => (w / total) * T);

  // Split any frame larger than the clamp into clamp-sized chunks plus a
  // remainder, mirroring how the loop would clamp long frames.
  const deltas = [];
  for (const d of scaled) {
    let remaining = d;
    while (remaining > MAX_DT) {
      deltas.push(MAX_DT);
      remaining -= MAX_DT;
    }
    if (remaining > 0) {
      deltas.push(remaining);
    }
  }
  return deltas;
}

/**
 * Build a World with a single pipe and collectible so we can measure the
 * horizontal displacement of scrolling entities. x values are kept large so
 * nothing is recycled (filtered out) during the interval.
 */
function makeWorld(playfield) {
  const startX = 1e6;
  return {
    state: 'Playing',
    playfield,
    ghost: { x: 0, y: 0, width: 0, height: 0, velocityY: 0 },
    pipes: [createPipePair(startX, 60, 100, 200, false)],
    collectibles: [createCollectible(startX, 120, 40, 40, false)],
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('advance delta-time invariance property-based tests', () => {
  // Feature: flappy-kiro, Property 22: Movement is delta-time invariant
  // Validates: Requirements 10.2
  it('total horizontal displacement equals scrollSpeed * T regardless of partition', () => {
    fc.assert(
      fc.property(
        // Playfield width (scrollSpeed is a fraction of this).
        fc.double({ min: 100, max: 4000, noNaN: true, noDefaultInfinity: true }),
        // Total time interval T (seconds).
        fc.double({ min: 0.001, max: 10, noNaN: true, noDefaultInfinity: true }),
        // Relative frame weights defining a random partition of T.
        fc.array(
          fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 60 },
        ),
        (width, T, weights) => {
          const cfg = createDefaultConfig();
          const playfield = createPlayfield(width, 600, 600);
          const scrollSpeed = cfg.spawn.scrollSpeedFrac * width;

          const deltas = partition(T, weights);
          // The partition should reconstitute T.
          const sumDt = deltas.reduce((a, b) => a + b, 0);

          const initial = makeWorld(playfield);
          const pipeStartX = initial.pipes[0].x;
          const collStartX = initial.collectibles[0].x;

          // Apply advance once per sub-frame.
          let world = initial;
          for (const dt of deltas) {
            world = advance(world, dt, cfg.spawn);
          }

          const pipeDisplacement = pipeStartX - world.pipes[0].x;
          const collDisplacement = collStartX - world.collectibles[0].x;

          // Expected displacement is scrollSpeed * (sum of the partition),
          // which equals scrollSpeed * T up to float accumulation.
          const expected = scrollSpeed * sumDt;

          // Tolerance scales with magnitude to absorb float accumulation over
          // many sub-frames.
          const tol = 1e-6 * (Math.abs(expected) + 1) * (deltas.length + 1);

          expect(pipeDisplacement).toBeCloseTo(expected, 4);
          expect(Math.abs(pipeDisplacement - expected)).toBeLessThanOrEqual(tol);
          // Both scrolling entities move by the same scroll speed.
          expect(collDisplacement).toBeCloseTo(pipeDisplacement, 4);

          // Independence from partition: a single-frame advance over the same
          // total time (clamped) yields the same displacement as the
          // multi-frame partition.
          const singleDeltas = partition(sumDt, [1]);
          let singleWorld = makeWorld(playfield);
          for (const dt of singleDeltas) {
            singleWorld = advance(singleWorld, dt, cfg.spawn);
          }
          const singleDisplacement = pipeStartX - singleWorld.pipes[0].x;
          expect(singleDisplacement).toBeCloseTo(pipeDisplacement, 3);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
