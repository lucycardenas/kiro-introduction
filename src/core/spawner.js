// Feature: flappy-kiro
// pipeSpawner for the pure simulation core. Generates pipe pairs (with a
// collectible between them) using an injected RNG and scrolls / recycles
// pipes and collectibles. These are pure functions: no I/O or side effects.
//
// Percentage-based requirement values live on SpawnConfig as fractions of the
// Playfield dimensions and are resolved against the current Playfield here, so
// the simulation stays resolution-independent.

import { createPipePair, createCollectible } from './models.js';

/**
 * @typedef {import('./models.js').World} World
 * @typedef {import('./models.js').PipePair} PipePair
 * @typedef {import('./models.js').Collectible} Collectible
 * @typedef {import('./models.js').SpawnConfig} SpawnConfig
 */

/**
 * @typedef {Object} Rng
 * @property {() => number} next returns a float in [0, 1)
 */

/**
 * Linearly interpolate a value in [min, max] from a unit sample u in [0, 1).
 * @param {number} u sample in [0, 1)
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function lerp(u, min, max) {
  return min + u * (max - min);
}

/**
 * Horizontal width given to each spawned pipe pair, expressed as a small
 * fraction of the Playfield width so the pair reads as a pipe rather than a
 * wall. Kept internal because the requirements fix only the gap and spacing.
 */
const PIPE_WIDTH_FRAC = 0.12;

/**
 * Side length of a spawned collectible as a fraction of the gap height. The
 * collectible is centered inside the gap, between the two pipes.
 */
const COLLECTIBLE_SIZE_FRAC = 0.4;

/**
 * Decide whether to spawn a new PipePair at the right edge of the Playfield.
 *
 * A new pair is spawned only when the horizontal distance between where the
 * new pair's left edge would sit (the right edge of the Playfield) and the
 * previous (rightmost) pair's left edge has grown into the configured spacing
 * window [spacingFracMin, spacingFracMax] of the Playfield width. When there
 * is no existing pair, the first pair spawns immediately.
 *
 * The new pair receives a randomized gap height in
 * [gapFracMin, gapFracMax] of the Playfield height and a randomized gap
 * position keeping at least verticalMarginFrac of the height clear from the
 * top boundary and from the Ground. A collectible is placed centered in the
 * gap, between the two pipes.
 *
 * The RNG is consumed in a fixed order: gap height, then gap position, then
 * the spacing target (only when a previous pair exists), so spawning is
 * deterministic given the RNG stream.
 *
 * Returns a new World; the input World is not mutated. When no spawn occurs
 * the same World reference is returned.
 *
 * @param {World} world current world
 * @param {Rng} rng injected random source
 * @param {SpawnConfig} cfg spawn configuration (fractions)
 * @returns {World}
 */
export function maybeSpawn(world, rng, cfg) {
  const { width, height, groundY } = world.playfield;
  const pipes = world.pipes;

  // The right edge is where a new pair's left edge would appear.
  const spawnX = width;

  // Find the rightmost existing pair (largest x), i.e. the most recently
  // spawned one that any new pair must be spaced from.
  let previous = null;
  for (const pair of pipes) {
    if (previous === null || pair.x > previous.x) {
      previous = pair;
    }
  }

  // Sample the spacing target up front so RNG consumption order is stable
  // whether or not we end up spawning. (When there is no previous pair we
  // still consume the same three samples to keep streams aligned.)
  const gapHeight = lerp(rng.next(), cfg.gapFracMin, cfg.gapFracMax) * height;
  const gapPosSample = rng.next();
  const spacingTarget =
    lerp(rng.next(), cfg.spacingFracMin, cfg.spacingFracMax) * width;

  if (previous !== null) {
    const spacing = spawnX - previous.x;
    if (spacing < spacingTarget) {
      // Not far enough from the previous pair yet.
      return world;
    }
  }

  const pipeWidth = PIPE_WIDTH_FRAC * width;
  const margin = cfg.verticalMarginFrac * height;

  // The gap top may range from `margin` (top margin) down to
  // `groundY - margin - gapHeight` (keeping the bottom margin above ground).
  const gapYMin = margin;
  const gapYMax = groundY - margin - gapHeight;
  // Guard against a degenerate range (tiny playfields); clamp to gapYMin.
  const gapY =
    gapYMax > gapYMin ? lerp(gapPosSample, gapYMin, gapYMax) : gapYMin;

  const pair = createPipePair(spawnX, pipeWidth, gapY, gapHeight, false);

  // Collectible centered inside the gap, between the two pipes.
  const collSize = COLLECTIBLE_SIZE_FRAC * gapHeight;
  const collX = spawnX + pipeWidth / 2 - collSize / 2;
  const collY = gapY + gapHeight / 2 - collSize / 2;
  const collectible = createCollectible(collX, collY, collSize, collSize, false);

  return {
    ...world,
    pipes: [...pipes, pair],
    collectibles: [...world.collectibles, collectible],
  };
}

/**
 * Move all pipes and collectibles left by `scrollSpeed * dt` using the same
 * scroll speed for both, and remove any entity whose right edge has moved
 * completely past the left boundary of the Playfield (right edge < 0).
 *
 * The scroll speed is `scrollSpeedFrac` of the Playfield width per second.
 *
 * Returns a new World; the input World is not mutated.
 *
 * @param {World} world current world
 * @param {number} dt elapsed seconds
 * @param {SpawnConfig} cfg spawn configuration (fractions)
 * @returns {World}
 */
export function advance(world, dt, cfg) {
  const { width } = world.playfield;
  const scrollSpeed = cfg.scrollSpeedFrac * width;
  const dx = scrollSpeed * dt;

  const pipes = world.pipes
    .map((p) => ({ ...p, x: p.x - dx }))
    .filter((p) => p.x + p.width >= 0);

  const collectibles = world.collectibles
    .map((c) => ({ ...c, x: c.x - dx }))
    .filter((c) => c.x + c.width >= 0);

  return { ...world, pipes, collectibles };
}
