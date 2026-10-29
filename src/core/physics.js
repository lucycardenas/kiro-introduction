// Feature: flappy-kiro
// Pure physics functions for the Ghost's vertical motion. No I/O or side
// effects: each function returns a new Ghost rather than mutating its input.
//
// Sign conventions (see models.js / PhysicsConfig):
//   - gravity is positive (downward acceleration, px/s^2)
//   - flapVelocity is negative (upward impulse, px/s)
//   - maxFallSpeed is positive (downward cap on velocityY, px/s)

import { createGhost } from './models.js';

/**
 * Apply gravity for `dt` seconds, then clamp the resulting downward velocity
 * to the configured maximum fall speed (Req 3.1, 3.3).
 *
 * Adds `gravity * dt` to `velocityY`, then caps `velocityY` at
 * `cfg.maxFallSpeed` so downward velocity never exceeds the maximum.
 *
 * @param {import('./models.js').Ghost} ghost
 * @param {number} dt seconds elapsed since the previous update
 * @param {import('./models.js').PhysicsConfig} cfg
 * @returns {import('./models.js').Ghost}
 */
export function applyGravity(ghost, dt, cfg) {
  const velocityY = Math.min(
    ghost.velocityY + cfg.gravity * dt,
    cfg.maxFallSpeed,
  );
  return createGhost(ghost.x, ghost.y, ghost.width, ghost.height, velocityY);
}

/**
 * Replace the Ghost's vertical velocity with the fixed upward flap velocity
 * (Req 2.3, 3.2).
 *
 * @param {import('./models.js').Ghost} ghost
 * @param {import('./models.js').PhysicsConfig} cfg
 * @returns {import('./models.js').Ghost}
 */
export function applyFlap(ghost, cfg) {
  return createGhost(
    ghost.x,
    ghost.y,
    ghost.width,
    ghost.height,
    cfg.flapVelocity,
  );
}

/**
 * Constrain the Ghost to the top boundary, pinning `y` to 0 and zeroing
 * `velocityY` when it has reached or passed the top (Req 7.3).
 *
 * @param {import('./models.js').Ghost} ghost
 * @returns {import('./models.js').Ghost}
 */
export function clampToTop(ghost) {
  if (ghost.y <= 0) {
    return createGhost(ghost.x, 0, ghost.width, ghost.height, 0);
  }
  return ghost;
}
