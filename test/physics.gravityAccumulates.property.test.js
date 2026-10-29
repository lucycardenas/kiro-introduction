// Feature: flappy-kiro, Property 3: Gravity accumulates each update
//
// Property-based test for the pure physics function `applyGravity`.
//
// Property 3 (design.md): For any Ghost whose resulting velocity stays below
// the maximum fall speed and for any delta time, applying gravity increases
// the Ghost's downward velocity by exactly gravity x delta time.
//
// Validates: Requirements 3.1
//
// Positive velocityY is downward (see models.js). To isolate the accumulation
// behaviour from the max-fall-speed clamp (which Property 5 covers), the
// generators constrain the inputs so the resulting velocity
// (velocityY + gravity * dt) stays strictly below maxFallSpeed.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyGravity } from '../src/core/physics.js';
import { createGhost, createDefaultConfig } from '../src/core/models.js';

describe('physics.applyGravity - Property 3: gravity accumulates each update', () => {
  it('increases downward velocity by exactly gravity * dt when below the cap', () => {
    fc.assert(
      fc.property(
        // A PhysicsConfig with a strictly positive gravity and a cap that
        // leaves room for accumulation.
        fc.record({
          gravity: fc.double({ min: 1, max: 5000, noNaN: true }),
          flapVelocity: fc.double({ min: -1000, max: -1, noNaN: true }),
          maxFallSpeed: fc.double({ min: 100, max: 5000, noNaN: true }),
        }),
        // Delta time in seconds, within a sane frame range (<= 100 ms clamp).
        fc.double({ min: 0, max: 0.1, noNaN: true }),
        // Ghost geometry; position/size are irrelevant to the velocity update.
        fc.record({
          x: fc.double({ min: 0, max: 2000, noNaN: true }),
          y: fc.double({ min: 0, max: 2000, noNaN: true }),
          width: fc.double({ min: 1, max: 200, noNaN: true }),
          height: fc.double({ min: 1, max: 200, noNaN: true }),
        }),
        // Prior vertical velocity (any direction).
        fc.double({ min: -5000, max: 5000, noNaN: true }),
        (cfg, dt, geom, velocityY) => {
          const expected = velocityY + cfg.gravity * dt;

          // Constrain to the property's premise: resulting velocity stays
          // strictly below the cap, so no clamping interferes. Discard the
          // (rare) cases that would hit or exceed the cap.
          fc.pre(expected < cfg.maxFallSpeed);

          const ghost = createGhost(
            geom.x,
            geom.y,
            geom.width,
            geom.height,
            velocityY
          );

          const result = applyGravity(ghost, dt, cfg);

          // Downward velocity increased by exactly gravity * dt. Use a
          // relative tolerance to absorb IEEE-754 rounding of the product.
          expect(result.velocityY).toBeCloseTo(expected, 6);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('uses the default config gravity to accumulate velocity', () => {
    const cfg = createDefaultConfig().physics;

    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.1, noNaN: true }),
        // Keep velocityY low enough that velocityY + gravity*dt stays under
        // the default maxFallSpeed cap across the whole dt range.
        fc.double({ min: -5000, max: 0, noNaN: true }),
        (dt, velocityY) => {
          const expected = velocityY + cfg.gravity * dt;
          fc.pre(expected < cfg.maxFallSpeed);

          const ghost = createGhost(100, 200, 32, 32, velocityY);
          const result = applyGravity(ghost, dt, cfg);

          expect(result.velocityY).toBeCloseTo(expected, 6);
        }
      ),
      { numRuns: 100 }
    );
  });
});
