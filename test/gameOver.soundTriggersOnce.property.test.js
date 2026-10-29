// Feature: flappy-kiro, Property 20: Game-over sound triggers exactly once
//
// For any transition into Game_Over followed by any number of subsequent ticks
// that remain in Game_Over, the game-over sound is triggered exactly once.
// `enterGameOver(world)` returns { world, playSound } where playSound is true
// only on the first call (guarded by the World's gameOverSoundPlayed flag).
// Calling it repeatedly while threading the returned world must report
// playSound: true exactly once — on the first call.
//
// Validates: Requirements 7.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { enterGameOver } from '../src/core/gameOver.js';
import { createPlayfield, createGhost } from '../src/core/models.js';

const NUM_RUNS = 100;

/**
 * Build a World freshly transitioned into Game_Over: the game-over sound has
 * not yet played.
 * @param {number} score
 * @param {number} highScore
 * @returns {import('../src/core/models.js').World}
 */
function makeGameOverWorld(score, highScore) {
  return {
    state: 'Game_Over',
    playfield: createPlayfield(800, 600, 600),
    ghost: createGhost(100, 300, 40, 40, 0),
    pipes: [],
    collectibles: [],
    score,
    highScore,
    backgroundOffset: 0,
    gameOverAt: 0,
    gameOverSoundPlayed: false,
  };
}

describe('enterGameOver game-over-sound-triggers-exactly-once property-based tests', () => {
  // Feature: flappy-kiro, Property 20: Game-over sound triggers exactly once
  // Validates: Requirements 7.4
  it('reports playSound true exactly once (the first call) across any number of subsequent Game_Over ticks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        // Number of additional ticks that remain in Game_Over after the first.
        fc.integer({ min: 0, max: 50 }),
        (score, highScore, extraTicks) => {
          let world = makeGameOverWorld(score, highScore);

          let playSoundCount = 0;
          const playSoundSignals = [];

          // First tick plus `extraTicks` subsequent ticks, threading the world.
          for (let i = 0; i < extraTicks + 1; i++) {
            const result = enterGameOver(world);
            world = result.world;
            playSoundSignals.push(result.playSound);
            if (result.playSound) {
              playSoundCount += 1;
            }
          }

          // The sound triggered exactly once in total.
          expect(playSoundCount).toBe(1);
          // And it was specifically the first call that triggered it; every
          // subsequent call reported false.
          expect(playSoundSignals[0]).toBe(true);
          for (let i = 1; i < playSoundSignals.length; i++) {
            expect(playSoundSignals[i]).toBe(false);
          }
          // The flag remains set, guaranteeing no future tick fires the sound.
          expect(world.gameOverSoundPlayed).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
