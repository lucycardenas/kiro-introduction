// Feature: flappy-kiro, Property 10: Off-screen entities are removed
//
// For any set of PipePairs and Collectibles and any delta time, after
// advancing, no PipePair or Collectible whose right edge has moved completely
// past the left boundary of the Playfield (right edge < 0) remains in the
// world. Entities still on screen (right edge >= 0) are retained.
//
// Validates: Requirements 4.3, 6.4

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

describe('advance off-screen-removal property-based tests', () => {
  // Feature: flappy-kiro, Property 10: Off-screen entities are removed
  // Validates: Requirements 4.3, 6.4
  it('removes every entity whose right edge moved past the left boundary and keeps the rest', () => {
    fc.assert(
      fc.property(
        // Playfield width; scrollSpeed is a fraction of this.
        finite({ min: 100, max: 4000 }),
        // scrollSpeedFrac within the documented [0.30, 0.50] range.
        finite({ min: 0.3, max: 0.5 }),
        // Elapsed seconds for a single advance step.
        finite({ min: 0, max: 0.5 }),
        // Pipe starting x positions. The wide, partly-negative range ensures a
        // mix of entities that stay on screen and entities that scroll off the
        // left boundary after this step.
        fc.array(finite({ min: -500, max: 4000 }), {
          minLength: 0,
          maxLength: 16,
        }),
        // Entity widths (shared shape for pipes and collectibles here).
        fc.array(finite({ min: 1, max: 300 }), { minLength: 0, maxLength: 16 }),
        // Collectible starting x positions.
        fc.array(finite({ min: -500, max: 4000 }), {
          minLength: 0,
          maxLength: 16,
        }),
        // Collectible widths.
        fc.array(finite({ min: 1, max: 300 }), { minLength: 0, maxLength: 16 }),
        (width, scrollSpeedFrac, dt, pipeXs, pipeWs, collXs, collWs) => {
          const cfg = spawnCfg(scrollSpeedFrac);
          const playfield = createPlayfield(width, 600, 600);
          const scrollSpeed = scrollSpeedFrac * width;
          const dx = scrollSpeed * dt;

          const pipes = pipeXs.map((x, i) =>
            createPipePair(x, pipeWs[i % pipeWs.length] ?? 60, 100, 200, false),
          );
          const collectibles = collXs.map((x, i) =>
            createCollectible(
              x,
              120,
              collWs[i % collWs.length] ?? 40,
              40,
              false,
            ),
          );

          const world = makeWorld(playfield, pipes, collectibles);
          const next = advance(world, dt, cfg);

          // --- Pipes ---------------------------------------------------------
          // No surviving pipe is off-screen (right edge strictly < 0).
          for (const p of next.pipes) {
            expect(p.x + p.width).toBeGreaterThanOrEqual(0);
          }
          // Every pipe that would remain on screen after scrolling survives,
          // and every pipe that scrolls off the left boundary is removed.
          const expectedPipes = pipes.filter((p) => p.x - dx + p.width >= 0);
          expect(next.pipes.length).toBe(expectedPipes.length);

          // --- Collectibles --------------------------------------------------
          for (const c of next.collectibles) {
            expect(c.x + c.width).toBeGreaterThanOrEqual(0);
          }
          const expectedColls = collectibles.filter(
            (c) => c.x - dx + c.width >= 0,
          );
          expect(next.collectibles.length).toBe(expectedColls.length);

          // Purity: the input world's entities are not mutated.
          pipes.forEach((p, i) => expect(p.x).toBe(pipeXs[i]));
          collectibles.forEach((c, i) => expect(c.x).toBe(collXs[i]));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
