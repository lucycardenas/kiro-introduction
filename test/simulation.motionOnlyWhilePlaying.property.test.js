// Feature: flappy-kiro
// Property-based test for simulation.step: motion and scoring happen only
// while the Game_State is Playing. For any World whose state is not Playing
// (Loading, Ready, Game_Over) and any delta time, advancing the simulation
// leaves every Ghost, Pipe_Pair, and Collectible position and the Ghost
// velocity unchanged, and the Score unchanged.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { step } from '../src/core/simulation.js';
import {
  createGhost,
  createPipePair,
  createCollectible,
  createPlayfield,
  createDefaultConfig,
} from '../src/core/models.js';

const NUM_RUNS = 100;

// Non-Playing states: advancing in any of these must leave the world fixed.
const NON_PLAYING_STATES = ['Loading', 'Ready', 'Game_Over'];

// An RNG that must never be consulted while the state is not Playing; if it is,
// the test surfaces the misuse by throwing.
const forbiddenRng = {
  next() {
    throw new Error('rng.next() should not be called outside Playing');
  },
};

/**
 * Build a World in the given non-Playing state populated with a Ghost (with a
 * non-zero velocity so any accidental integration would show), several
 * Pipe_Pairs, and Collectibles. The exact values do not matter; they just need
 * to be present so that any unintended motion or scoring would change a field.
 */
function makeWorld(state, playfield, ghost, pipes, collectibles, score, highScore) {
  return {
    state,
    playfield,
    ghost,
    pipes,
    collectibles,
    score,
    highScore,
    backgroundOffset: 0,
    gameOverAt: state === 'Game_Over' ? 12345 : null,
    gameOverSoundPlayed: false,
  };
}

describe('step motion-only-while-Playing property-based tests', () => {
  // Feature: flappy-kiro, Property 2: Motion only advances while Playing
  // Validates: Requirements 1.6, 7.5
  it('leaves the World unchanged when stepping outside the Playing state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_PLAYING_STATES),
        // Any delta time, including large and tiny values.
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        // Playfield dimensions.
        fc.double({ min: 100, max: 4000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 100, max: 4000, noNaN: true, noDefaultInfinity: true }),
        // Ghost fields, including a non-zero velocity.
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -900, max: 900, noNaN: true, noDefaultInfinity: true }),
        // Pipe pairs: list of [x, gapY] tuples.
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 4000, noNaN: true, noDefaultInfinity: true }),
            fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true }),
            fc.boolean(),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        // Collectibles: list of [x, y, collected] tuples.
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 4000, noNaN: true, noDefaultInfinity: true }),
            fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
            fc.boolean(),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (
          state,
          dt,
          width,
          height,
          gx,
          gy,
          gv,
          pipeTuples,
          collTuples,
          score,
          highScore,
        ) => {
          const cfg = createDefaultConfig();
          const playfield = createPlayfield(width, height, height);
          const ghost = createGhost(gx, gy, 30, 30, gv);
          const pipes = pipeTuples.map(([x, gapY, scored]) =>
            createPipePair(x, 60, gapY, 150, scored),
          );
          const collectibles = collTuples.map(([x, y, collected]) =>
            createCollectible(x, y, 40, 40, collected),
          );

          const world = makeWorld(
            state,
            playfield,
            ghost,
            pipes,
            collectibles,
            score,
            highScore,
          );

          // Deep snapshot of the relevant fields before stepping.
          const before = JSON.parse(
            JSON.stringify({
              state: world.state,
              ghost: world.ghost,
              pipes: world.pipes,
              collectibles: world.collectibles,
              score: world.score,
              highScore: world.highScore,
              backgroundOffset: world.backgroundOffset,
              gameOverAt: world.gameOverAt,
            }),
          );

          const result = step(world, dt, forbiddenRng, cfg);

          // No ghost motion and no velocity change.
          expect(result.ghost).toEqual(before.ghost);
          // No pipe or collectible movement / mutation.
          expect(result.pipes).toEqual(before.pipes);
          expect(result.collectibles).toEqual(before.collectibles);
          // No score change and no state transition.
          expect(result.score).toEqual(before.score);
          expect(result.highScore).toEqual(before.highScore);
          expect(result.state).toEqual(before.state);
          // Background and game-over bookkeeping untouched.
          expect(result.backgroundOffset).toEqual(before.backgroundOffset);
          expect(result.gameOverAt).toEqual(before.gameOverAt);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
