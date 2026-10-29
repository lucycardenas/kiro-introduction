// Feature: flappy-kiro, Property 19: Restart is gated by the 500 ms lockout
//
// For any Game_Over World, a restart flap is honored (resets to Ready) only
// when at least RESTART_LOCKOUT_MS (500 ms) have elapsed since the World
// entered Game_Over. A flap before the window has fully elapsed is ignored and
// the World stays in Game_Over.
//
// Validates: Requirements 8.5, 8.6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { handleFlap, RESTART_LOCKOUT_MS } from '../src/core/simulation.js';
import {
  createGhost,
  createPlayfield,
  createDefaultConfig,
} from '../src/core/models.js';

const cfg = createDefaultConfig();

// A finite, non-NaN, non-negative float for wall-clock milliseconds. Kept well
// below Number.MAX_SAFE_INTEGER so `gameOverAt + offset` stays exact.
const timeMs = fc.double({
  min: 0,
  max: 1e12,
  noNaN: true,
  noDefaultInfinity: true,
});

// Elapsed offset in ms since entering Game_Over. The range straddles the
// lockout threshold on both sides so generated cases cover honored and ignored
// restarts.
const elapsedMs = fc.double({
  min: 0,
  max: 2000,
  noNaN: true,
  noDefaultInfinity: true,
});

// Build a Game_Over World stamped with a given gameOverAt moment.
function gameOverWorld(gameOverAt) {
  const playfield = createPlayfield(400, 600, 560);
  return {
    state: 'Game_Over',
    playfield,
    ghost: createGhost(120, 300, 36, 36, 0),
    pipes: [],
    collectibles: [],
    score: 7,
    highScore: 12,
    backgroundOffset: 0,
    gameOverAt,
    gameOverSoundPlayed: true,
  };
}

describe('Property 19: Restart is gated by the 500 ms lockout', () => {
  it('restarts (Ready) iff at least RESTART_LOCKOUT_MS have elapsed since Game_Over', () => {
    fc.assert(
      fc.property(timeMs, elapsedMs, (gameOverAt, offset) => {
        const world = gameOverWorld(gameOverAt);
        const now = gameOverAt + offset;
        const result = handleFlap(world, now, cfg);

        if (offset >= RESTART_LOCKOUT_MS) {
          // Lockout satisfied: the flap is honored and resets to Ready.
          expect(result.state).toBe('Ready');
        } else {
          // Still within the lockout: the flap is ignored, stay in Game_Over.
          expect(result.state).toBe('Game_Over');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('at exactly the lockout boundary the restart is honored (>= is inclusive)', () => {
    fc.assert(
      fc.property(timeMs, (gameOverAt) => {
        const world = gameOverWorld(gameOverAt);
        const now = gameOverAt + RESTART_LOCKOUT_MS;
        const result = handleFlap(world, now, cfg);
        expect(result.state).toBe('Ready');
      }),
      { numRuns: 100 },
    );
  });

  it('a restart resets score and clears game-over bookkeeping; an ignored flap leaves the world unchanged', () => {
    fc.assert(
      fc.property(timeMs, elapsedMs, (gameOverAt, offset) => {
        const world = gameOverWorld(gameOverAt);
        const now = gameOverAt + offset;
        const result = handleFlap(world, now, cfg);

        if (offset >= RESTART_LOCKOUT_MS) {
          // On restart the world returns to a fresh Ready: score zeroed and
          // the game-over timestamp cleared, high score preserved.
          expect(result.state).toBe('Ready');
          expect(result.score).toBe(0);
          expect(result.gameOverAt).toBeNull();
          expect(result.highScore).toBe(world.highScore);
        } else {
          // Ignored flap returns the same world reference (no mutation).
          expect(result).toBe(world);
        }
      }),
      { numRuns: 200 },
    );
  });
});
