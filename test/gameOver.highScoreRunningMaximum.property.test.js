// Feature: flappy-kiro, Property 21: Stored high score is the running maximum
//
// Property-based test for the pure Game_Over helper `enterGameOver`.
//
// Property 21 (design.md Property 19): For any sequence of game sessions with
// final scores, the stored high score after each Game_Over equals the maximum
// of all final scores seen so far. `enterGameOver` promotes the session Score
// into the running high score on first entry via
// `highScore = max(score, highScore)`, guarded by `gameOverSoundPlayed`.
//
// Validates: Requirements 8.4
//
// Strategy: generate a non-empty sequence of non-negative integer final scores
// (Req 8.4's Score is a non-negative integer) plus an arbitrary non-negative
// starting high score (a value a prior browser session may have stored).
// Starting from that high score, simulate each session: set world.score to the
// session's final score, reset the per-session `gameOverSoundPlayed` flag to
// false so `enterGameOver` performs the promotion, then enter Game_Over. After
// each session assert world.highScore equals the running maximum of the
// starting high score and every final score seen so far.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { enterGameOver } from '../src/core/gameOver.js';
import { createPlayfield } from '../src/core/models.js';

// Build a minimal World sufficient for `enterGameOver`, which only reads
// `score`, `highScore`, and `gameOverSoundPlayed` and returns an updated World.
function makeWorld(startHighScore) {
  return {
    state: 'Game_Over',
    playfield: createPlayfield(1600, 900, 900),
    ghost: { x: 0, y: 0, width: 0, height: 0, velocityY: 0 },
    pipes: [],
    collectibles: [],
    score: 0,
    highScore: startHighScore,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('gameOver - Property 21: stored high score is the running maximum', () => {
  it('keeps the stored high score equal to the running max of all final scores across sessions', () => {
    fc.assert(
      fc.property(
        // A value a prior session may have persisted as the high score.
        fc.nat({ max: 10_000 }),
        // A non-empty sequence of per-session final scores.
        fc.array(fc.nat({ max: 10_000 }), { minLength: 1, maxLength: 30 }),
        (startHighScore, finalScores) => {
          let world = makeWorld(startHighScore);

          // The running maximum tracked independently of the implementation.
          let runningMax = startHighScore;

          for (const finalScore of finalScores) {
            // Begin a fresh session with this final score. The per-session
            // flag must be false so Game_Over performs the promotion.
            world = { ...world, score: finalScore, gameOverSoundPlayed: false };

            const { world: next } = enterGameOver(world);
            world = next;

            runningMax = Math.max(runningMax, finalScore);

            // After each Game_Over the stored high score is the running max.
            expect(world.highScore).toBe(runningMax);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
