// Feature: flappy-kiro, Property 13: Score is always a non-negative integer
//
// Property-based test for the pure scoring functions `scorePipePasses` and
// `collectOverlapping`.
//
// Property 13 (design.md): For any sequence of scoring operations (pipe passes
// and collectible pickups), the Score remains a non-negative integer.
//
// Validates: Requirements 5.4
//
// Strategy: generate an arbitrary World with a non-negative integer starting
// score, a randomly placed Ghost, and random sequences of PipePairs and
// Collectibles. Then apply a randomly ordered sequence of scoring operations
// (scorePipePasses / collectOverlapping). After the whole World is constructed
// and after every individual operation, assert the invariant
// `Number.isInteger(score) && score >= 0` holds. The Ghost position is varied
// so that some operations award points and some do not, exercising both the
// "increment" and "no-op" branches of each scoring function.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scorePipePasses, collectOverlapping } from '../src/core/scoring.js';
import {
  createGhost,
  createPipePair,
  createCollectible,
  createPlayfield,
} from '../src/core/models.js';

// Build a World-like object sufficient for the scoring functions. Scoring only
// reads world.ghost, world.pipes, world.collectibles and reads/writes
// world.score, so we keep the shape minimal but valid.
function makeWorld(startScore, ghost, pipes, collectibles, groundY) {
  return {
    state: 'Playing',
    playfield: createPlayfield(1600, groundY, groundY),
    ghost,
    pipes,
    collectibles,
    score: startScore,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

function assertScoreInvariant(score) {
  expect(Number.isInteger(score)).toBe(true);
  expect(score).toBeGreaterThanOrEqual(0);
}

// Operation selector: 0 => scorePipePasses, 1 => collectOverlapping.
const opArb = fc.constantFrom('pipe', 'collect');

describe('scoring - Property 13: score is always a non-negative integer', () => {
  it('keeps the score a non-negative integer across any sequence of scoring operations', () => {
    fc.assert(
      fc.property(
        // Non-negative integer starting score (Req 5.4 allows any valid prior score).
        fc.nat({ max: 10_000 }),
        // Ghost bounding box placed anywhere within a generous play area.
        fc.record({
          x: fc.double({ min: 0, max: 1600, noNaN: true }),
          y: fc.double({ min: 0, max: 900, noNaN: true }),
          width: fc.double({ min: 10, max: 120, noNaN: true }),
          height: fc.double({ min: 10, max: 120, noNaN: true }),
        }),
        // A sequence of PipePairs, some of which may already be scored.
        fc.array(
          fc.record({
            x: fc.double({ min: -200, max: 1800, noNaN: true }),
            width: fc.double({ min: 10, max: 300, noNaN: true }),
            gapY: fc.double({ min: 40, max: 400, noNaN: true }),
            gapHeight: fc.double({ min: 40, max: 300, noNaN: true }),
            scored: fc.boolean(),
          }),
          { maxLength: 12 }
        ),
        // A sequence of Collectibles, some of which may already be collected.
        fc.array(
          fc.record({
            x: fc.double({ min: -200, max: 1800, noNaN: true }),
            y: fc.double({ min: 0, max: 900, noNaN: true }),
            width: fc.double({ min: 5, max: 80, noNaN: true }),
            height: fc.double({ min: 5, max: 80, noNaN: true }),
            collected: fc.boolean(),
          }),
          { maxLength: 12 }
        ),
        // A random sequence of scoring operations to apply, in order.
        fc.array(opArb, { minLength: 1, maxLength: 20 }),
        (startScore, g, pipeSpecs, collSpecs, ops) => {
          const ghost = createGhost(g.x, g.y, g.width, g.height, 0);
          const pipes = pipeSpecs.map((p) =>
            createPipePair(p.x, p.width, p.gapY, p.gapHeight, p.scored)
          );
          const collectibles = collSpecs.map((c) =>
            createCollectible(c.x, c.y, c.width, c.height, c.collected)
          );
          const groundY = 900;
          const world = makeWorld(startScore, ghost, pipes, collectibles, groundY);

          // Invariant holds on the freshly built World.
          assertScoreInvariant(world.score);

          // Apply each operation in order, checking the invariant after every step.
          for (const op of ops) {
            if (op === 'pipe') {
              scorePipePasses(world);
            } else {
              collectOverlapping(world);
            }
            assertScoreInvariant(world.score);
          }

          // Final invariant check, and the score never decreased below the start.
          assertScoreInvariant(world.score);
          expect(world.score).toBeGreaterThanOrEqual(startScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
