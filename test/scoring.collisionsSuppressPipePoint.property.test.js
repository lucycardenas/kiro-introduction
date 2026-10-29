// Feature: flappy-kiro, Property 12: Collisions suppress the pipe point
//
// For any Pipe_Pair and any tick in which the Ghost overlaps that pair while
// its horizontal center has not yet crossed the pair's center, advancing the
// tick leaves that pair's `scored` flag false and does not increase the Score
// for that pair.
//
// Validates: Requirements 5.3
//
// Strategy: `step` runs the collision check BEFORE awarding pipe-pass points
// (simulation.js steps 6 then 7). So when the Ghost overlaps a pipe rectangle
// the tick transitions to Game_Over and returns before `scorePipePasses` runs.
// We build worlds in which the Ghost bounding box overlaps the top or bottom
// pipe of a single pair while the Ghost's horizontal center sits strictly to
// the LEFT of the pair's horizontal center, then assert that after one `step`
// the pair stays unscored and the Score did not go up.
//
// To isolate the collision/scoring ordering we neutralise the other tick
// effects: a dt of 0 means gravity/scroll move nothing and no spawn/collect
// occurs, so the Ghost and pair keep the geometry we constructed. We still
// exercise `step` end-to-end (physics -> spawn -> scroll -> collect ->
// collision -> scoring) rather than calling `scorePipePasses` directly.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { step } from '../src/core/simulation.js';
import {
  createGhost,
  createPipePair,
  createPlayfield,
  createDefaultConfig,
  pipeCenterX,
  topPipeRect,
  bottomPipeRect,
} from '../src/core/models.js';
import { overlaps } from '../src/core/collision.js';

const NUM_RUNS = 100;

// A deterministic RNG stub. With dt = 0 the spawner's `advance` moves nothing
// and `maybeSpawn` may spawn a far-right pair, but that pair cannot overlap the
// Ghost (placed over our target pair on the left). A constant stream is enough.
const rng = { next: () => 0.5 };

const finite = (opts) =>
  fc.double({ noNaN: true, noDefaultInfinity: true, ...opts });

/**
 * Build a Playing-state World carrying exactly one pipe pair and a Ghost.
 * @param {import('../src/core/models.js').Playfield} playfield
 * @param {import('../src/core/models.js').Ghost} ghost
 * @param {import('../src/core/models.js').PipePair} pair
 */
function makeWorld(playfield, ghost, pair) {
  return {
    state: 'Playing',
    playfield,
    ghost,
    pipes: [pair],
    collectibles: [],
    score: 7, // arbitrary non-zero starting score to detect any increase
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('scoring - Property 12: collisions suppress the pipe point', () => {
  // Feature: flappy-kiro, Property 12: Collisions suppress the pipe point
  // Validates: Requirements 5.3
  it('leaves the overlapped pair unscored and does not raise the Score when the Ghost center has not crossed the pair center', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Playfield large enough to hold the pipe comfortably.
          width: finite({ min: 400, max: 4000 }),
          height: finite({ min: 400, max: 2000 }),
          // Pair geometry.
          pipeX: finite({ min: 50, max: 1500 }),
          pipeWidth: finite({ min: 20, max: 300 }),
          gapY: finite({ min: 60, max: 300 }),
          gapHeight: finite({ min: 60, max: 300 }),
          bottomExtent: finite({ min: 60, max: 400 }),
          // Ghost square size.
          ghostSize: finite({ min: 10, max: 120 }),
          // Which pipe to overlap: top (false) or bottom (true).
          useBottom: fc.boolean(),
          // Interior anchor fraction (vertical) inside the chosen pipe rect.
          vFrac: finite({ min: 0.1, max: 0.9 }),
        }),
        (p) => {
          const groundY = p.gapY + p.gapHeight + p.bottomExtent;
          const playfieldHeight = Math.max(p.height, groundY + 10);
          const playfield = createPlayfield(p.width, playfieldHeight, groundY);
          const pair = createPipePair(
            p.pipeX,
            p.pipeWidth,
            p.gapY,
            p.gapHeight,
            false,
          );

          const centerX = pipeCenterX(pair);

          // Place the Ghost so it overlaps the pipe horizontally while its
          // center stays strictly LEFT of the pair center. We anchor the
          // Ghost's center at the pipe's left edge (pair.x): its right half
          // pokes into the pipe column (horizontal overlap) and its center
          // pair.x is strictly less than the pair center pair.x + width/2.
          const size = p.ghostSize;
          const ghostCenterX = pair.x;
          const ghostX = ghostCenterX - size / 2;

          // Vertically, land the Ghost inside the chosen pipe rect so there is
          // genuine 2D overlap. Keep the box within the rect's vertical span.
          const rect = p.useBottom
            ? bottomPipeRect(pair, groundY)
            : topPipeRect(pair);

          // Only run the case when the chosen rect has room for the ghost box.
          fc.pre(rect.height > 0 && rect.width > 0);

          // Vertical anchor strictly inside the rect, box centred on it but
          // clamped so it stays within [rect.y, rect.y + rect.height].
          const anchorY = rect.y + p.vFrac * rect.height;
          let ghostY = anchorY - size / 2;
          const minY = rect.y;
          const maxY = rect.y + rect.height - size;
          if (maxY >= minY) {
            ghostY = Math.min(Math.max(ghostY, minY), maxY);
          } else {
            // Rect shorter than the ghost: centre the ghost on the rect so it
            // still straddles it vertically.
            ghostY = rect.y + rect.height / 2 - size / 2;
          }

          // velocityY 0 so gravity (scaled by dt = 0) keeps the ghost put.
          const ghost = createGhost(ghostX, ghostY, size, size, 0);

          // Preconditions of the property: the Ghost overlaps the pipe and its
          // center is strictly left of the pair center. If a degenerate sample
          // breaks either, discard it rather than assert on it.
          const ghostBox = {
            x: ghost.x,
            y: ghost.y,
            width: ghost.width,
            height: ghost.height,
          };
          fc.pre(overlaps(ghostBox, rect));
          fc.pre(ghost.x + ghost.width / 2 < centerX);
          // Ghost must not already be resting on the ground (that is a separate
          // game-over path; here we want the pipe-overlap path).
          fc.pre(ghost.y + ghost.height < groundY);

          const world = makeWorld(playfield, ghost, pair);
          const scoreBefore = world.score;

          const next = step(world, 0, rng, createDefaultConfig());

          // The overlapped pair is still present and still unscored.
          const samePair = next.pipes.find(
            (q) => q.x === pair.x && q.width === pair.width && q.gapY === pair.gapY,
          );
          expect(samePair).toBeDefined();
          expect(samePair.scored).toBe(false);

          // No point was awarded for that pair: the Score did not increase.
          expect(next.score).toBe(scoreBefore);

          // And the overlap ended the tick in Game_Over (collision path), which
          // is exactly why the pipe point was suppressed.
          expect(next.state).toBe('Game_Over');

          // Purity: the input world's pair is untouched.
          expect(pair.scored).toBe(false);
          expect(world.score).toBe(scoreBefore);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
