// Feature: flappy-kiro
// Unit tests for the core data model helpers (Requirements 4.1, 4.2, 4.4, 4.5).
// These cover the derived-geometry helpers for a PipePair (top/bottom pipe
// rects and horizontal center) and verify the default config fractions fall
// within the design's documented ranges.

import { describe, it, expect } from 'vitest';
import {
  createPipePair,
  topPipeRect,
  bottomPipeRect,
  pipeCenterX,
  createDefaultConfig,
} from '../src/core/models.js';

describe('topPipeRect', () => {
  it('occupies the full width of the pair from the top edge down to gapY', () => {
    const pair = createPipePair(100, 60, 150, 200);

    expect(topPipeRect(pair)).toEqual({ x: 100, y: 0, width: 60, height: 150 });
  });

  it('has zero height when the gap starts at the top boundary', () => {
    const pair = createPipePair(0, 50, 0, 300);

    expect(topPipeRect(pair)).toEqual({ x: 0, y: 0, width: 50, height: 0 });
  });

  it('shares the pair x and width and always starts at y = 0', () => {
    const pair = createPipePair(237, 42, 88, 120);
    const rect = topPipeRect(pair);

    expect(rect.x).toBe(pair.x);
    expect(rect.width).toBe(pair.width);
    expect(rect.y).toBe(0);
    expect(rect.height).toBe(pair.gapY);
  });
});

describe('bottomPipeRect', () => {
  it('starts at gapY + gapHeight and extends down to the ground', () => {
    const pair = createPipePair(100, 60, 150, 200);
    const groundY = 500;

    // top of the bottom pipe = 150 + 200 = 350; height = 500 - 350 = 150
    expect(bottomPipeRect(pair, groundY)).toEqual({
      x: 100,
      y: 350,
      width: 60,
      height: 150,
    });
  });

  it('has zero height when the gap ends exactly at the ground', () => {
    const pair = createPipePair(10, 40, 100, 300);
    const groundY = 400; // gapY + gapHeight === groundY

    expect(bottomPipeRect(pair, groundY)).toEqual({
      x: 10,
      y: 400,
      width: 40,
      height: 0,
    });
  });

  it('is vertically contiguous with the gap below the top pipe', () => {
    const pair = createPipePair(5, 30, 120, 180);
    const groundY = 600;
    const top = topPipeRect(pair);
    const bottom = bottomPipeRect(pair, groundY);

    // The gap sits between the bottom of the top pipe and the top of the bottom pipe.
    expect(bottom.y).toBe(top.y + top.height + pair.gapHeight);
    expect(bottom.x).toBe(pair.x);
    expect(bottom.width).toBe(pair.width);
    expect(bottom.y + bottom.height).toBe(groundY);
  });
});

describe('pipeCenterX', () => {
  it('returns the midpoint of the pair horizontal span', () => {
    expect(pipeCenterX(createPipePair(100, 60, 150, 200))).toBe(130);
  });

  it('handles fractional widths', () => {
    expect(pipeCenterX(createPipePair(10, 25, 0, 100))).toBe(22.5);
  });

  it('equals x when the pair has zero width', () => {
    expect(pipeCenterX(createPipePair(42, 0, 0, 100))).toBe(42);
  });
});

describe('createDefaultConfig', () => {
  const config = createDefaultConfig();

  it('places physics values on the documented sides of zero', () => {
    // gravity downward/positive, flapVelocity upward/negative, maxFallSpeed positive.
    expect(config.physics.gravity).toBeGreaterThan(0);
    expect(config.physics.flapVelocity).toBeLessThan(0);
    expect(config.physics.maxFallSpeed).toBeGreaterThan(0);
  });

  it('uses a scroll speed fraction within [0.30, 0.50] of width (Req 4.1)', () => {
    expect(config.spawn.scrollSpeedFrac).toBeGreaterThanOrEqual(0.3);
    expect(config.spawn.scrollSpeedFrac).toBeLessThanOrEqual(0.5);
  });

  it('uses spacing fractions of [0.40, 0.60] of width (Req 4.2)', () => {
    expect(config.spawn.spacingFracMin).toBe(0.4);
    expect(config.spawn.spacingFracMax).toBe(0.6);
    expect(config.spawn.spacingFracMin).toBeLessThan(config.spawn.spacingFracMax);
  });

  it('uses gap fractions of [0.20, 0.35] of height (Req 4.4)', () => {
    expect(config.spawn.gapFracMin).toBe(0.2);
    expect(config.spawn.gapFracMax).toBe(0.35);
    expect(config.spawn.gapFracMin).toBeLessThan(config.spawn.gapFracMax);
  });

  it('uses a 10% top/ground vertical margin fraction (Req 4.5)', () => {
    expect(config.spawn.verticalMarginFrac).toBe(0.1);
  });

  it('leaves room for a valid gap within the margins', () => {
    // Two margins plus the largest gap must still fit inside the height (fraction < 1).
    const maxUsedFrac =
      2 * config.spawn.verticalMarginFrac + config.spawn.gapFracMax;
    expect(maxUsedFrac).toBeLessThan(1);
  });
});
