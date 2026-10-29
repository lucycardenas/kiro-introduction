// Feature: flappy-kiro
// Property-based test for spawner.maybeSpawn: a newly spawned PipePair has a
// valid gap. The gap height stays within [20%, 35%] of the Playfield height
// and the gap is positioned so its top is at least 10% of the height below the
// top boundary and its bottom is at least 10% of the height above the Ground.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { maybeSpawn } from '../src/core/spawner.js';
import { createPlayfield, createDefaultConfig } from '../src/core/models.js';

const NUM_RUNS = 100;

/**
 * Build a deterministic RNG from a fixed list of unit samples in [0, 1).
 * maybeSpawn consumes samples in a fixed order: gap height, gap position,
 * spacing target. The RNG cycles through the provided samples so it never
 * runs dry regardless of how many values are requested.
 *
 * @param {number[]} samples unit samples in [0, 1)
 * @returns {{ next: () => number }}
 */
function rngFrom(samples) {
  let i = 0;
  return {
    next() {
      const v = samples[i % samples.length];
      i += 1;
      return v;
    },
  };
}

/**
 * Build a Ready-ish World with no existing pipes so maybeSpawn always spawns
 * the first pair (no spacing gate when there is no previous pair).
 *
 * @param {import('../src/core/models.js').Playfield} playfield
 * @returns {import('../src/core/models.js').World}
 */
function makeEmptyWorld(playfield) {
  return {
    state: 'Playing',
    playfield,
    ghost: { x: 0, y: 0, width: 0, height: 0, velocityY: 0 },
    pipes: [],
    collectibles: [],
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('spawner.maybeSpawn spawned-gaps-valid property-based tests', () => {
  // Feature: flappy-kiro, Property 9: Spawned gaps are valid
  // Validates: Requirements 4.4, 4.5
  it('a newly spawned pair has a gap height in [20%, 35%] of height with >=10% top and ground margins', () => {
    fc.assert(
      fc.property(
        // Playfield dimensions. Height is kept large enough that the gap
        // positioning range is non-degenerate for every allowed gap height
        // (max gap 35% + two 10% margins = 55% < 100%).
        fc.double({ min: 100, max: 4000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 200, max: 3000, noNaN: true, noDefaultInfinity: true }),
        // RNG stream: fast-check-provided unit samples driving the spawn.
        fc.array(
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true, maxExcluded: true }),
          { minLength: 1, maxLength: 24 },
        ),
        (width, height, samples) => {
          const cfg = createDefaultConfig();
          const playfield = createPlayfield(width, height, height);
          const world = makeEmptyWorld(playfield);
          const rng = rngFrom(samples);

          const next = maybeSpawn(world, rng, cfg.spawn);

          // With no previous pair, a spawn must have occurred.
          expect(next.pipes.length).toBe(1);
          const pair = next.pipes[0];

          const gapMin = cfg.spawn.gapFracMin * height; // 20%
          const gapMax = cfg.spawn.gapFracMax * height; // 35%
          const margin = cfg.spawn.verticalMarginFrac * height; // 10%

          // Gap height within [20%, 35%] of height (float tolerance).
          const tol = 1e-9 * (height + 1);
          expect(pair.gapHeight).toBeGreaterThanOrEqual(gapMin - tol);
          expect(pair.gapHeight).toBeLessThanOrEqual(gapMax + tol);

          // Top of the gap at least 10% of height below the top boundary.
          expect(pair.gapY).toBeGreaterThanOrEqual(margin - tol);

          // Bottom of the gap at least 10% of height above the Ground.
          const gapBottom = pair.gapY + pair.gapHeight;
          expect(gapBottom).toBeLessThanOrEqual(playfield.groundY - margin + tol);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
