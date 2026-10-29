// Feature: flappy-kiro, Property 7: Pipes and collectibles scroll left at the configured speed
//
// For any set of PipePairs and Collectibles and any delta time while Playing,
// advancing the simulation decreases each entity's x coordinate by exactly
// scrollSpeed * dt, using the same scroll speed for pipes and collectibles,
// where scrollSpeed lies between 30% and 50% of the Playfield width per second.
//
// Validates: Requirements 4.1, 6.1

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { advance } from '../src/core/spawner.js';
import {
  createPipePair,
  createCollectible,
  createPlayfield,
} from '../src/core/models.js';

const NUM_RUNS = 100;

/**
 * Build a World in the Playing state carrying the supplied pipes and
 * collectibles. Positions are supplied by the caller/generators.
 * @param {import('../src/core/models.js').Playfield} playfield
 * @param {import('../src/core/models.js').PipePair[]} pipes
 * @param {import('../src/core/models.js').Collectible[]} collectibles
 */
function makeWorld(playfield, pipes, collectibles) {
  return {
    state: 'Playing',
    playfield,
    ghost: { x: 0, y: 0, width: 0, height: 0, velocityY: 0 },
    pipes,
    collectibles,
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

// A spawn config whose scrollSpeedFrac is generated within the documented
// [0.30, 0.50] range; the other fields are irrelevant to `advance`.
function spawnCfg(scrollSpeedFrac) {
  return {
    scrollSpeedFrac,
    spacingFracMin: 0.4,
    spacingFracMax: 0.6,
    gapFracMin: 0.2,
    gapFracMax: 0.35,
    verticalMarginFrac: 0.1,
  };
}

const finite = (opts) =>
  fc.double({ noNaN: true, noDefaultInfinity: true, ...opts });

describe('advance scroll-speed property-based tests', () => {
  // Feature: flappy-kiro, Property 7: Pipes and collectibles scroll left at the configured speed
  // Validates: Requirements 4.1, 6.1
  it('decreases each entity x by exactly scrollSpeed * dt, same speed for pipes and collectibles', () => {
    fc.assert(
      fc.property(
        // Playfield width; scrollSpeed is a fraction of this.
        finite({ min: 100, max: 4000 }),
        // scrollSpeedFrac within the documented [0.30, 0.50] range.
        finite({ min: 0.3, max: 0.5 }),
        // Elapsed seconds for a single advance step.
        finite({ min: 0, max: 0.1 }),
        // Starting x positions for pipes. Kept large so no entity is recycled
        // (filtered out) during this single step.
        fc.array(finite({ min: 1e5, max: 1e6 }), { minLength: 0, maxLength: 12 }),
        // Starting x positions for collectibles.
        fc.array(finite({ min: 1e5, max: 1e6 }), { minLength: 0, maxLength: 12 }),
        (width, scrollSpeedFrac, dt, pipeXs, collXs) => {
          const cfg = spawnCfg(scrollSpeedFrac);
          const playfield = createPlayfield(width, 600, 600);
          const scrollSpeed = scrollSpeedFrac * width;

          // scrollSpeed must sit between 30% and 50% of width per second.
          expect(scrollSpeed).toBeGreaterThanOrEqual(0.3 * width);
          expect(scrollSpeed).toBeLessThanOrEqual(0.5 * width);

          const pipes = pipeXs.map((x) => createPipePair(x, 60, 100, 200, false));
          const collectibles = collXs.map((x) =>
            createCollectible(x, 120, 40, 40, false),
          );

          const world = makeWorld(playfield, pipes, collectibles);
          const next = advance(world, dt, cfg);

          const expectedDx = scrollSpeed * dt;

          // Every pipe's x decreased by exactly scrollSpeed * dt.
          expect(next.pipes.length).toBe(pipes.length);
          next.pipes.forEach((p, i) => {
            expect(pipes[i].x - p.x).toBeCloseTo(expectedDx, 6);
            // Other fields are untouched.
            expect(p.width).toBe(pipes[i].width);
            expect(p.gapY).toBe(pipes[i].gapY);
            expect(p.gapHeight).toBe(pipes[i].gapHeight);
          });

          // Every collectible's x decreased by the same amount.
          expect(next.collectibles.length).toBe(collectibles.length);
          next.collectibles.forEach((c, i) => {
            expect(collectibles[i].x - c.x).toBeCloseTo(expectedDx, 6);
            expect(c.y).toBe(collectibles[i].y);
            expect(c.width).toBe(collectibles[i].width);
            expect(c.height).toBe(collectibles[i].height);
          });

          // Same scroll speed for both: when both exist, the per-entity
          // displacement matches across the two collections.
          if (next.pipes.length > 0 && next.collectibles.length > 0) {
            const pipeDx = pipes[0].x - next.pipes[0].x;
            const collDx = collectibles[0].x - next.collectibles[0].x;
            expect(collDx).toBeCloseTo(pipeDx, 6);
          }

          // Purity: the input world is not mutated.
          pipes.forEach((p, i) => expect(p.x).toBe(pipeXs[i]));
          collectibles.forEach((c, i) => expect(c.x).toBe(collXs[i]));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
