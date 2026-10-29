// Feature: flappy-kiro, Property 11: Each pipe scores at most once
//
// The first time the Ghost's horizontal center crosses a PipePair's center
// while Playing, the Score increases by exactly 1 and the pair is marked
// scored; applying the scoring step any number of additional times awards no
// further points for that pair.
//
// Validates: Requirements 5.1, 5.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scorePipePasses } from '../src/core/scoring.js';
import {
  createGhost,
  createPipePair,
  createPlayfield,
  pipeCenterX,
} from '../src/core/models.js';

const NUM_RUNS = 100;

const finite = (opts) =>
  fc.double({ noNaN: true, noDefaultInfinity: true, ...opts });

/**
 * Build a World in the Playing state carrying the supplied ghost and pipes.
 * @param {import('../src/core/models.js').Ghost} ghost
 * @param {import('../src/core/models.js').PipePair[]} pipes
 */
function makeWorld(ghost, pipes) {
  return {
    state: 'Playing',
    playfield: createPlayfield(800, 600, 600),
    ghost,
    pipes,
    collectibles: [],
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('scorePipePasses each-pipe-scores-at-most-once property-based tests', () => {
  // Feature: flappy-kiro, Property 11: Each pipe scores at most once
  // Validates: Requirements 5.1, 5.2
  it('awards exactly 1 the first time the ghost center crosses a pair center, and never again on repeated steps', () => {
    fc.assert(
      fc.property(
        // Ghost horizontal geometry: left edge and width -> center = x + w/2.
        finite({ min: 0, max: 2000 }),
        finite({ min: 1, max: 200 }),
        // A set of pipe pairs defined by left edge and width.
        fc.array(
          fc.record({
            x: finite({ min: -2000, max: 4000 }),
            width: finite({ min: 1, max: 300 }),
          }),
          { minLength: 0, maxLength: 16 },
        ),
        // How many extra times to re-apply the scoring step (idempotence).
        fc.integer({ min: 0, max: 8 }),
        (ghostX, ghostWidth, pairSpecs, extraSteps) => {
          const ghost = createGhost(ghostX, 100, ghostWidth, 40, 0);
          const ghostCenterX = ghostX + ghostWidth / 2;

          const pipes = pairSpecs.map((p) =>
            createPipePair(p.x, p.width, 150, 200, false),
          );

          // Which pairs should score: those whose center is at or left of the
          // ghost center (the ghost has reached/passed the crossing point).
          const expectedScorers = pipes.filter(
            (pair) => ghostCenterX >= pipeCenterX(pair),
          );
          const expectedCount = expectedScorers.length;

          const world = makeWorld(ghost, pipes);

          // First scoring step: awards exactly 1 per crossed pair.
          scorePipePasses(world);

          expect(world.score).toBe(expectedCount);
          // Each crossed pair is marked scored; uncrossed pairs are not.
          world.pipes.forEach((pair) => {
            const crossed = ghostCenterX >= pipeCenterX(pair);
            expect(pair.scored).toBe(crossed);
          });

          // Idempotence: re-applying the step any number of times awards no
          // further points and leaves the scored flags unchanged.
          for (let i = 0; i < extraSteps; i++) {
            scorePipePasses(world);
          }

          expect(world.score).toBe(expectedCount);
          world.pipes.forEach((pair) => {
            const crossed = ghostCenterX >= pipeCenterX(pair);
            expect(pair.scored).toBe(crossed);
          });

          // No single pair contributed more than 1 point: the total score can
          // never exceed the number of pairs.
          expect(world.score).toBeLessThanOrEqual(pipes.length);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: flappy-kiro, Property 11: Each pipe scores at most once
  // Validates: Requirements 5.1, 5.2
  it('a pair that has already scored is never awarded again even if it starts scored', () => {
    fc.assert(
      fc.property(
        finite({ min: 0, max: 2000 }),
        finite({ min: 1, max: 200 }),
        // A single pair whose center sits at or left of the ghost center, so
        // it would score if it were not already flagged.
        finite({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 8 }),
        (ghostX, ghostWidth, pairWidth, steps) => {
          const ghost = createGhost(ghostX, 100, ghostWidth, 40, 0);
          // Place the pair center exactly at the ghost center so it is "crossed".
          const ghostCenterX = ghostX + ghostWidth / 2;
          const pairX = ghostCenterX - pairWidth / 2;

          // Already scored: the award must not fire again.
          const alreadyScored = createPipePair(pairX, pairWidth, 150, 200, true);
          const world = makeWorld(ghost, [alreadyScored]);

          for (let i = 0; i < steps; i++) {
            scorePipePasses(world);
          }

          expect(world.score).toBe(0);
          expect(world.pipes[0].scored).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
