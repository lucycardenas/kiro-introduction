// Feature: flappy-kiro
// Simulation lifecycle for the pure core: build a Ready world, reset a world
// back to Ready, and advance one Playing tick. This module composes the other
// pure core modules (physics, spawner, collision, scoring) and the state
// machine's allowed transitions. It performs no rendering, audio, storage, or
// input I/O.
//
// Percentage-based config values live on the SpawnConfig as fractions of the
// Playfield dimensions and are resolved against the current Playfield by the
// modules they flow into (spawner.maybeSpawn / spawner.advance). The Ready
// start position (30% width / 50% height) is likewise resolved against the
// current Playfield here.

import { createGhost } from './models.js';
import { applyGravity, clampToTop } from './physics.js';
import { maybeSpawn, advance } from './spawner.js';
import { overlaps, touchesGround } from './collision.js';
import { scorePipePasses, collectOverlapping } from './scoring.js';
import { topPipeRect, bottomPipeRect } from './models.js';

/**
 * @typedef {import('./models.js').World} World
 * @typedef {import('./models.js').Playfield} Playfield
 * @typedef {import('./models.js').Ghost} Ghost
 * @typedef {import('./models.js').Config} Config
 */

/**
 * @typedef {Object} Rng
 * @property {() => number} next returns a float in [0, 1)
 */

/**
 * Fixed start position of the Ghost, expressed as fractions of the Playfield
 * so the start position scales with any Playfield size (Req 1.3): horizontally
 * at 30% of the width, vertically at 50% of the height.
 */
const GHOST_START_X_FRAC = 0.3;
const GHOST_START_Y_FRAC = 0.5;

/**
 * Ghost bounding-box size as a fraction of the Playfield height. Kept internal
 * because the requirements fix the start position but not the sprite size; a
 * small square keeps the Ghost resolution-independent.
 */
const GHOST_SIZE_FRAC = 0.06;

/**
 * Build the Ghost placed at its Ready start position for a given Playfield.
 * The Ghost's top-left is offset so that its *center* sits at 30% width / 50%
 * height, and its vertical velocity is zero so it stays stationary until the
 * first flap (Req 1.3, 1.6).
 *
 * @param {Playfield} playfield
 * @returns {Ghost}
 */
function buildStartGhost(playfield) {
  const size = GHOST_SIZE_FRAC * playfield.height;
  const centerX = GHOST_START_X_FRAC * playfield.width;
  const centerY = GHOST_START_Y_FRAC * playfield.height;
  return createGhost(centerX - size / 2, centerY - size / 2, size, size, 0);
}

/**
 * The Ghost bounding box as a Rect.
 * @param {Ghost} ghost
 * @returns {import('./models.js').Rect}
 */
function ghostRect(ghost) {
  return { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height };
}

/**
 * True iff the Ghost's bounding box overlaps the top or bottom pipe of any
 * Pipe_Pair in the World (Req 7.1).
 * @param {World} world
 * @returns {boolean}
 */
function hitsAnyPipe(world) {
  const gRect = ghostRect(world.ghost);
  const groundY = world.playfield.groundY;
  for (const pair of world.pipes) {
    if (
      overlaps(gRect, topPipeRect(pair)) ||
      overlaps(gRect, bottomPipeRect(pair, groundY))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Create a fresh World in the Ready state for the given Playfield. The Ghost
 * is placed at its start position (30% width / 50% height, Req 1.3) with the
 * Score at 0 (Req 1.4) and no pipes or collectibles present. `highScore` is
 * carried in from storage so the Game_Over screen can show it later.
 *
 * @param {Playfield} playfield current Playfield dimensions
 * @param {number} [highScore=0] previously stored high score
 * @param {Config} [cfg] configuration (unused here but accepted for symmetry
 *   with the other lifecycle functions and future needs)
 * @returns {World}
 */
export function createReadyWorld(playfield, highScore = 0, cfg) {
  void cfg;
  return {
    state: 'Ready',
    playfield,
    ghost: buildStartGhost(playfield),
    pipes: [],
    collectibles: [],
    score: 0,
    highScore,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

/**
 * Reset an existing World back to the Ready state: remove every Pipe_Pair and
 * Collectible (Req 8.7), zero the Score (Req 8.8), return the Ghost to its
 * start position, and clear the game-over bookkeeping. The current Playfield
 * and carried `highScore` are preserved.
 *
 * Returns a new World; the input World is not mutated.
 *
 * @param {World} world current world
 * @param {Config} [cfg] configuration (accepted for symmetry; unused)
 * @returns {World}
 */
export function resetToReady(world, cfg) {
  void cfg;
  return {
    ...world,
    state: 'Ready',
    ghost: buildStartGhost(world.playfield),
    pipes: [],
    collectibles: [],
    score: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

/**
 * Advance the simulation by `dt` seconds. Motion and scoring happen only while
 * the Game_State is Playing; in any other state (Loading, Ready, Game_Over)
 * the World is returned unchanged so no Ghost, Pipe_Pair, or Collectible moves
 * and the Ghost velocity is untouched (Req 1.6, 7.5).
 *
 * Within a Playing tick the steps run in this order:
 *   1. Apply gravity to the Ghost, then integrate its vertical position.
 *   2. Clamp the Ghost to the top boundary, zeroing velocity there (Req 7.3).
 *   3. Spawn any new Pipe_Pair / Collectible due at the right edge.
 *   4. Scroll pipes and collectibles left and drop off-screen ones.
 *   5. Collect any collectibles the Ghost now overlaps.
 *   6. Check collisions (pipe overlap or ground) BEFORE awarding pipe points.
 *   7. Award pipe-pass points (only reached when no collision ended the tick).
 *
 * Step 6 runs before step 7 per the design's scoring/collision ordering note
 * for Req 5.3: when the Ghost overlaps a pipe the tick transitions to
 * Game_Over and halts before any pipe point is awarded. Because a point is
 * only granted once the Ghost's center has *crossed* a pair's center — a
 * position unreachable without first clearing the pipe rectangles — a
 * collision before the crossing leaves `scored` false and no point is awarded
 * for that pair.
 *
 * On a pipe or ground collision the state becomes Game_Over, all motion stops
 * (the Ghost velocity is zeroed), and `gameOverAt` is stamped so the restart
 * lockout can be measured later (Req 7.1, 7.2, 7.5).
 *
 * Returns a new World; the input World is not mutated.
 *
 * @param {World} world current world
 * @param {number} dt elapsed seconds since the previous tick
 * @param {Rng} rng injected random source for spawning
 * @param {Config} cfg configuration (physics + spawn fractions)
 * @returns {World}
 */
export function step(world, dt, rng, cfg) {
  if (world.state !== 'Playing') {
    // Req 1.6 / 7.5: no motion or scoring outside Playing.
    return world;
  }

  // 1. Gravity, then integrate the Ghost's vertical position.
  const movedGhost = applyGravity(world.ghost, dt, cfg.physics);
  const integratedGhost = createGhost(
    movedGhost.x,
    movedGhost.y + movedGhost.velocityY * dt,
    movedGhost.width,
    movedGhost.height,
    movedGhost.velocityY,
  );

  // 2. Clamp to the top boundary (pins y to 0 and zeros velocity there).
  const clampedGhost = clampToTop(integratedGhost);

  let next = { ...world, ghost: clampedGhost };

  // 3. Spawn, then 4. scroll / recycle pipes and collectibles.
  next = maybeSpawn(next, rng, cfg.spawn);
  next = advance(next, dt, cfg.spawn);

  // 5. Collect any collectibles the Ghost now overlaps (Req 6.2, 6.3).
  next = collectOverlapping(next);

  // 6. Collision check BEFORE scoring pipe passes (Req 5.3 ordering note).
  const hitPipe = hitsAnyPipe(next);
  const hitGround = touchesGround(next.ghost, next.playfield.groundY);
  if (hitPipe || hitGround) {
    return {
      ...next,
      state: 'Game_Over',
      // Stop all motion: zero the Ghost velocity (Req 7.5).
      ghost: createGhost(
        next.ghost.x,
        next.ghost.y,
        next.ghost.width,
        next.ghost.height,
        0,
      ),
      // Stamp the game-over moment for the restart lockout (Req 8.5, 8.6).
      // The orchestrator compares this against the same wall-clock source it
      // passes to handleFlap.
      gameOverAt: Date.now(),
    };
  }

  // 7. Award pipe-pass points (Req 5.1, 5.2). Only reached when the tick did
  // not end in a collision.
  next = scorePipePasses(next);

  return next;
}
