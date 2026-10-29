// Feature: flappy-kiro
// Pure collision helpers for the simulation core. Axis-aligned bounding-box
// (AABB) overlap is used for pipe collisions and collectible pickup
// (Req 6.2, 7.1); ground contact is a simple edge test (Req 7.2).
// No I/O or side effects live here.

/**
 * @typedef {import('./models.js').Rect} Rect
 * @typedef {import('./models.js').Ghost} Ghost
 */

/**
 * True iff two axis-aligned rectangles overlap. Uses strict inequalities so
 * rectangles that merely share an edge (zero overlap area) are not counted as
 * overlapping (Req 6.2, 7.1).
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
export function overlaps(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * True iff the ghost's bottom edge has reached or passed the ground line
 * (Req 7.2).
 * @param {Ghost} ghost
 * @param {number} groundY
 * @returns {boolean}
 */
export function touchesGround(ghost, groundY) {
  return ghost.y + ghost.height >= groundY;
}
