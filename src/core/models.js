// Feature: flappy-kiro
// Core data model definitions, factory helpers, and derived-geometry helpers
// for the pure simulation core. No I/O or side effects live here.
//
// Spatial fields on moving entities are stored in absolute pixels resolved
// against the current Playfield size. Config values the requirements express
// as percentages are stored as fractions and multiplied by Playfield
// dimensions at spawn/resolve time.

/**
 * @typedef {'Loading' | 'Ready' | 'Playing' | 'Game_Over'} GameState
 */

/**
 * @typedef {Object} Rect
 * @property {number} x       left, px
 * @property {number} y       top, px
 * @property {number} width   px
 * @property {number} height  px
 */

/**
 * @typedef {Object} Ghost
 * @property {number} x          px (fixed horizontal position)
 * @property {number} y          px (vertical, top-left of bounding box)
 * @property {number} width      px
 * @property {number} height     px
 * @property {number} velocityY  px/s (positive = downward)
 */

/**
 * @typedef {Object} PipePair
 * @property {number} x          px, left edge of the pair
 * @property {number} width      px
 * @property {number} gapY       px, top of the gap
 * @property {number} gapHeight  px, vertical size of the gap
 * @property {boolean} scored    true once this pair has awarded its point
 */

/**
 * @typedef {Object} Collectible
 * @property {number} x           px, left edge
 * @property {number} y           px, top edge
 * @property {number} width       px
 * @property {number} height      px
 * @property {boolean} collected  true once picked up
 */

/**
 * @typedef {Object} Playfield
 * @property {number} width    px
 * @property {number} height   px
 * @property {number} groundY  px, y of the ground line
 */

/**
 * @typedef {Object} World
 * @property {GameState} state
 * @property {Playfield} playfield
 * @property {Ghost} ghost
 * @property {PipePair[]} pipes
 * @property {Collectible[]} collectibles
 * @property {number} score
 * @property {number} highScore
 * @property {number} backgroundOffset
 * @property {number | null} gameOverAt
 * @property {boolean} gameOverSoundPlayed
 */

/**
 * @typedef {Object} PhysicsConfig
 * @property {number} gravity       px/s^2 (downward)
 * @property {number} flapVelocity  px/s (upward, stored as negative)
 * @property {number} maxFallSpeed  px/s (downward cap)
 */

/**
 * @typedef {Object} SpawnConfig
 * @property {number} scrollSpeedFrac    fraction of width/second, in [0.30, 0.50]
 * @property {number} spacingFracMin     0.40 of width
 * @property {number} spacingFracMax     0.60 of width
 * @property {number} gapFracMin         0.20 of height
 * @property {number} gapFracMax         0.35 of height
 * @property {number} verticalMarginFrac 0.10 of height, top and ground
 */

/**
 * @typedef {Object} Config
 * @property {PhysicsConfig} physics
 * @property {SpawnConfig} spawn
 */

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a Rect.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Rect}
 */
export function createRect(x, y, width, height) {
  return { x, y, width, height };
}

/**
 * Create a Ghost.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [velocityY=0]
 * @returns {Ghost}
 */
export function createGhost(x, y, width, height, velocityY = 0) {
  return { x, y, width, height, velocityY };
}

/**
 * Create a PipePair.
 * @param {number} x
 * @param {number} width
 * @param {number} gapY
 * @param {number} gapHeight
 * @param {boolean} [scored=false]
 * @returns {PipePair}
 */
export function createPipePair(x, width, gapY, gapHeight, scored = false) {
  return { x, width, gapY, gapHeight, scored };
}

/**
 * Create a Collectible.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {boolean} [collected=false]
 * @returns {Collectible}
 */
export function createCollectible(x, y, width, height, collected = false) {
  return { x, y, width, height, collected };
}

/**
 * Create a Playfield.
 * @param {number} width
 * @param {number} height
 * @param {number} [groundY=height]
 * @returns {Playfield}
 */
export function createPlayfield(width, height, groundY = height) {
  return { width, height, groundY };
}

// ---------------------------------------------------------------------------
// Derived geometry helpers for a PipePair
// ---------------------------------------------------------------------------

/**
 * Rect for the top pipe of a pair, occupying y in [0, gapY).
 * @param {PipePair} pair
 * @returns {Rect}
 */
export function topPipeRect(pair) {
  return { x: pair.x, y: 0, width: pair.width, height: pair.gapY };
}

/**
 * Rect for the bottom pipe of a pair, occupying y in [gapY + gapHeight, groundY).
 * @param {PipePair} pair
 * @param {number} groundY
 * @returns {Rect}
 */
export function bottomPipeRect(pair, groundY) {
  const top = pair.gapY + pair.gapHeight;
  return { x: pair.x, y: top, width: pair.width, height: groundY - top };
}

/**
 * Horizontal center of a pair: x + width / 2.
 * @param {PipePair} pair
 * @returns {number}
 */
export function pipeCenterX(pair) {
  return pair.x + pair.width / 2;
}

// ---------------------------------------------------------------------------
// Default config builder
// ---------------------------------------------------------------------------

/**
 * Build the default configuration. Spawn fractions match the design's
 * documented ranges; physics values are sensible defaults within the
 * documented sign/direction constraints (gravity downward/positive,
 * flapVelocity upward/negative, maxFallSpeed downward/positive).
 * @returns {Config}
 */
export function createDefaultConfig() {
  return {
    physics: {
      gravity: 1600, // px/s^2 downward (positive)
      flapVelocity: -480, // px/s upward (negative)
      maxFallSpeed: 900, // px/s downward cap (positive)
    },
    spawn: {
      scrollSpeedFrac: 0.4, // within [0.30, 0.50]
      spacingFracMin: 0.4,
      spacingFracMax: 0.6,
      gapFracMin: 0.2,
      gapFracMax: 0.35,
      verticalMarginFrac: 0.1,
    },
  };
}
