// Feature: flappy-kiro
// Pure core helper for the Game_Over transition. It owns the two bits of
// game-over bookkeeping that must stay deterministic and testable:
//
//   1. Promoting the session Score into the running high score, so the stored
//      high score becomes max(score, storedHighScore) (Req 8.4).
//   2. Deciding whether the game-over sound should fire, exactly once per
//      Game_Over, via the World's `gameOverSoundPlayed` flag (Req 7.4).
//
// This module performs no I/O: it neither plays audio nor touches storage. It
// returns an updated World together with a `playSound` signal so the
// orchestrator can drive the AudioSystem and HighScoreStore adapters. Keeping
// the logic pure lets the once-only and running-maximum guarantees be verified
// directly with property tests.

/**
 * @typedef {import('./models.js').World} World
 */

/**
 * @typedef {Object} GameOverResult
 * @property {World} world
 *   the updated World, with `highScore` promoted to the running maximum and
 *   `gameOverSoundPlayed` set true.
 * @property {boolean} playSound
 *   true exactly once per Game_Over — on the first call after entering
 *   Game_Over — and false on every subsequent call. The orchestrator plays the
 *   game-over sound iff this is true.
 */

/**
 * Handle entry into the Game_Over state.
 *
 * Idempotent across repeated ticks: the first invocation after entering
 * Game_Over raises the high score to `max(score, highScore)` and reports
 * `playSound: true`; every later invocation (while the flag remains set)
 * leaves the World unchanged and reports `playSound: false`, so the game-over
 * sound triggers exactly once (Req 7.4) and the stored high score is the
 * running maximum (Req 8.4).
 *
 * @param {World} world the current World, expected to be in Game_Over
 * @returns {GameOverResult} the updated World and whether to play the sound
 */
export function enterGameOver(world) {
  // Already handled: a prior tick fired the sound and promoted the score. Do
  // nothing further so the sound plays exactly once.
  if (world.gameOverSoundPlayed) {
    return { world, playSound: false };
  }

  const highScore = Math.max(world.score, world.highScore);

  return {
    world: {
      ...world,
      highScore,
      gameOverSoundPlayed: true,
    },
    playSound: true,
  };
}
