// Feature: flappy-kiro
// Pure scoring functions for the simulation core: awarding points for passing
// pipe pairs and for collecting overlapping point items. No I/O or side
// effects live here. Each function mutates and returns the given World so the
// orchestrator can chain scoring steps within a single Playing tick.

/**
 * @typedef {import('./models.js').World} World
 * @typedef {import('./models.js').Ghost} Ghost
 * @typedef {import('./models.js').Rect} Rect
 * @typedef {import('./models.js').PipePair} PipePair
 * @typedef {import('./models.js').Collectible} Collectible
 */

import { pipeCenterX } from './models.js';

/**
 * Axis-aligned bounding-box overlap test. Mirrors the collision module's
 * `overlaps` helper (design: Collision.overlaps, Req 6.2). Two rectangles
 * overlap when they intersect on both axes; shared edges alone do not count
 * as an overlap.
 *
 * Kept local so scoring stays a self-contained pure module.
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Horizontal center of the Ghost: x + width / 2.
 * @param {Ghost} ghost
 * @returns {number}
 */
function ghostCenterX(ghost) {
  return ghost.x + ghost.width / 2;
}

/**
 * The Ghost bounding box as a Rect.
 * @param {Ghost} ghost
 * @returns {Rect}
 */
function ghostRect(ghost) {
  return { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height };
}

/**
 * Award +1 and mark `scored = true` the first time the Ghost's horizontal
 * center crosses a Pipe_Pair's horizontal center; never award again for the
 * same pair (Req 5.1, 5.2). The Score stays a non-negative integer (Req 5.4):
 * it starts non-negative and only ever increases by whole points here.
 *
 * A pair scores once its center is at or to the left of the Ghost's center
 * (the Ghost has reached/passed the crossing point). The `scored` flag makes
 * the award idempotent, so re-running this step awards nothing further.
 *
 * @param {World} world
 * @returns {World} the same World, mutated
 */
export function scorePipePasses(world) {
  const centerX = ghostCenterX(world.ghost);
  for (const pair of world.pipes) {
    if (!pair.scored && centerX >= pipeCenterX(pair)) {
      pair.scored = true;
      world.score += 1;
    }
  }
  return world;
}

/**
 * Award +1 per newly overlapping, uncollected Collectible, mark it collected,
 * and remove it from the World so it cannot be collected again (Req 6.2, 6.3).
 * The Score stays a non-negative integer (Req 5.4): each pickup adds exactly
 * one whole point.
 *
 * @param {World} world
 * @returns {World} the same World, mutated (collected items removed)
 */
export function collectOverlapping(world) {
  const gRect = ghostRect(world.ghost);
  /** @type {Collectible[]} */
  const remaining = [];
  for (const item of world.collectibles) {
    if (!item.collected && overlaps(gRect, item)) {
      item.collected = true;
      world.score += 1;
      // Removed from the World by not carrying it into `remaining`.
    } else {
      remaining.push(item);
    }
  }
  world.collectibles = remaining;
  return world;
}
