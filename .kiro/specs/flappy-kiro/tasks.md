# Implementation Plan: Flappy Kiro

## Overview

This plan implements Flappy Kiro as a no-build browser game using plain HTML/CSS/JavaScript ES modules with the Canvas 2D API, `requestAnimationFrame`, `localStorage`, and `HTMLAudioElement`. It follows the design's pure-core / impure-shell architecture: the deterministic simulation core (data models, state machine, physics, spawner, collision, scoring) is built and property-tested first, then the browser adapters (asset loader, input, game loop, renderer, audio, high-score store), and finally the orchestrator and HTML entry point that wire everything together.

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) with Vitest; one property test per correctness property (Properties 1–23). Tasks build incrementally so each step integrates into the growing system with no orphaned code. The game reuses existing workspace assets: `assets/ghosty.png`, `img/chiikawa_point.png`, `assets/jump.wav`, and `assets/game_over.wav`.

## Tasks

- [x] 1. Set up project structure, tooling, and HTML shell
  - Create `src/` directory for the game modules and `test/` for test files
  - Add `package.json` with Vitest and fast-check as dev dependencies and a `test` script (`vitest run`)
  - Add `vitest.config.js` configured for ES modules
  - Create `index.html` with a `<canvas>` element and a `<script type="module">` that imports the game entry point (orchestrator wiring added in a later task)
  - Create `styles.css` with basic page layout centering the canvas
  - _Requirements: 1.1_

- [ ] 2. Implement core data models and shared types
  - [-] 2.1 Create data model definitions and factory helpers
    - Create `src/core/models.js` with JSDoc typedefs/factories for `Rect`, `Ghost`, `PipePair`, `Collectible`, `World`, `PhysicsConfig`, `SpawnConfig`, and `GameState`
    - Add helpers to derive the top-pipe rect `[0, gapY)`, bottom-pipe rect `[gapY + gapHeight, groundY)`, and horizontal center `x + width/2` of a `PipePair`
    - Add a helper to build a default config (gravity, flapVelocity, maxFallSpeed, scroll/spacing/gap/margin fractions) matching the design's documented ranges
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 2.2 Write unit tests for data model helpers
    - Test top/bottom pipe rect derivation and horizontal center computation
    - Test default config values fall within the documented ranges
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [ ] 3. Implement the game state machine
  - [-] 3.1 Implement `GameStateMachine`
    - Create `src/core/stateMachine.js` exposing `state`, `canTransition(to)`, and `transition(to)`
    - Allow only `Loading → Ready`, `Ready → Playing`, `Playing → Game_Over`, `Game_Over → Ready`; reject all others
    - _Requirements: 2.1, 7.1, 7.2, 8.5_

  - [x] 3.2 Write unit tests for the state machine
    - Verify each allowed transition succeeds and representative invalid transitions are rejected
    - _Requirements: 2.1, 7.1, 7.2, 8.5_

- [ ] 4. Implement physics (gravity, flap, clamping)
  - [-] 4.1 Implement pure physics functions
    - Create `src/core/physics.js` with `applyGravity(ghost, dt, cfg)`, `applyFlap(ghost, cfg)`, and `clampToTop(ghost)`
    - `applyGravity` adds `gravity * dt` to `velocityY` then clamps to `maxFallSpeed`; `applyFlap` replaces `velocityY` with the fixed upward flap velocity; `clampToTop` pins `y` to the top boundary and zeros `velocityY`
    - _Requirements: 3.1, 3.2, 3.3, 7.3, 2.3_

  - [x] 4.2 Write property test: gravity accumulates each update
    - **Property 3: Gravity accumulates each update**
    - **Validates: Requirements 3.1**

  - [x] 4.3 Write property test: flap sets a fixed upward velocity
    - **Property 4: Flap sets a fixed upward velocity**
    - **Validates: Requirements 2.3, 3.2**

  - [x] 4.4 Write property test: downward velocity is capped
    - **Property 5: Downward velocity is capped**
    - **Validates: Requirements 3.3**

  - [x] 4.5 Write property test: top boundary clamps position and zeros velocity
    - **Property 17: Top boundary clamps position and zeros velocity**
    - **Validates: Requirements 7.3**

- [ ] 5. Implement collision detection
  - [-] 5.1 Implement pure collision functions
    - Create `src/core/collision.js` with `overlaps(a, b)` (AABB overlap) and `touchesGround(ghost, groundY)` (ghost bottom edge at or below ground)
    - _Requirements: 6.2, 7.1, 7.2_

  - [x] 5.2 Write property test: pipe overlap is detected as collision
    - **Property 15: Pipe overlap is detected as collision**
    - **Validates: Requirements 7.1**

  - [x] 5.3 Write property test: ground contact is detected
    - **Property 16: Ground contact is detected**
    - **Validates: Requirements 7.2**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement the pipe/collectible spawner and scrolling
  - [x] 7.1 Implement `pipeSpawner` with injected RNG
    - Create `src/core/spawner.js` with `maybeSpawn(world, rng, cfg)` and `advance(world, dt, cfg)`
    - `maybeSpawn` spawns a new `PipePair` at the right edge only when horizontal spacing from the previous pair falls in `[0.40, 0.60]` of width, with randomized gap height in `[0.20, 0.35]` of height and gap position keeping ≥10% top and ground margins; also spawns collectibles between pipes
    - `advance` moves pipes and collectibles left by `scrollSpeed * dt` (same speed for both) and removes entities whose right edge passed the left boundary
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.4_

  - [x] 7.2 Write property test: pipes and collectibles scroll left at the configured speed
    - **Property 7: Pipes and collectibles scroll left at the configured speed**
    - **Validates: Requirements 4.1, 6.1**

  - [x] 7.3 Write property test: spawn spacing stays within bounds
    - **Property 8: Spawn spacing stays within bounds**
    - **Validates: Requirements 4.2**

  - [x] 7.4 Write property test: spawned gaps are valid
    - **Property 9: Spawned gaps are valid**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 7.5 Write property test: off-screen entities are removed
    - **Property 10: Off-screen entities are removed**
    - **Validates: Requirements 4.3, 6.4**

- [x] 8. Implement scoring (pipe passes and collectibles)
  - [x] 8.1 Implement pure scoring functions
    - Create `src/core/scoring.js` with `scorePipePasses(world)` and `collectOverlapping(world)`
    - `scorePipePasses` awards +1 and marks `scored = true` the first time the ghost center crosses a pair's center, and never again; `collectOverlapping` awards +1 per newly overlapping collectible, marks it collected, and removes it
    - Keep `score` a non-negative integer throughout
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.2, 6.3_

  - [x] 8.2 Write property test: each pipe scores at most once
    - **Property 11: Each pipe scores at most once**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 8.3 Write property test: collisions suppress the pipe point
    - **Property 12: Collisions suppress the pipe point**
    - **Validates: Requirements 5.3**

  - [x] 8.4 Write property test: score is always a non-negative integer
    - **Property 13: Score is always a non-negative integer**
    - **Validates: Requirements 5.4**

  - [x] 8.5 Write property test: collecting awards exactly one point and is final
    - **Property 14: Collecting awards exactly one point and is final**
    - **Validates: Requirements 6.2, 6.3**

- [x] 9. Implement the simulation step and world lifecycle in the core
  - [x] 9.1 Implement world creation, reset, and the Playing-only step
    - Create `src/core/simulation.js` with `createReadyWorld(playfield, highScore, cfg)` placing the ghost at 30% width / 50% height with score 0, `resetToReady(world, cfg)` clearing all pipes/collectibles and zeroing score, and `step(world, dt, rng, cfg)` that advances physics, spawning, scrolling, scoring, and collision checks only while Playing (no motion otherwise)
    - On collision (pipe overlap or ground) transition to `Game_Over`, stop all motion, and stamp `gameOverAt`; clamp the ghost to the top boundary when it reaches it
    - Resolve percentage-based config fractions against the current playfield dimensions
    - _Requirements: 1.3, 1.6, 7.1, 7.2, 7.3, 7.5, 8.7, 8.8_

  - [x] 9.2 Write property test: Ready start position scales with the Playfield
    - **Property 1: Ready start position scales with the Playfield**
    - **Validates: Requirements 1.3**

  - [x] 9.3 Write property test: motion only advances while Playing
    - **Property 2: Motion only advances while Playing**
    - **Validates: Requirements 1.6, 7.5**

  - [x] 9.4 Write property test: reset clears the World
    - **Property 21: Reset clears the World**
    - **Validates: Requirements 8.7, 8.8**

- [x] 10. Implement restart lockout and flap gating in the core
  - [x] 10.1 Implement flap handling and restart timing
    - Add `handleFlap(world, now, cfg)` to `src/core/simulation.js`: start the game from Ready (applying exactly one flap impulse), flap while Playing, reset to Ready from Game_Over only when ≥500 ms since `gameOverAt`, and ignore flap while Loading
    - _Requirements: 2.1, 2.3, 3.2, 3.6, 8.5, 8.6_

  - [x] 10.2 Write property test: flap is ignored outside active states
    - **Property 6: Flap is ignored outside active states**
    - **Validates: Requirements 3.6**

  - [x] 10.3 Write property test: restart is gated by the 500 ms lockout
    - **Property 20: Restart is gated by the 500 ms lockout**
    - **Validates: Requirements 8.5, 8.6**

- [x] 11. Checkpoint - Ensure all core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement the HighScoreStore adapter
  - [-] 12.1 Implement `HighScoreStore` over localStorage
    - Create `src/adapters/highScoreStore.js` with `get()` and `set(score)` using key `flappy-kiro.highScore`; `get()` returns 0 for missing/malformed values and `set()` tolerates storage errors
    - _Requirements: 8.3, 8.4_

  - [x] 12.2 Write mock-based tests for HighScoreStore
    - Test read/write round-trip and fallback to 0 on missing/malformed values using a mocked `localStorage`
    - _Requirements: 8.3, 8.4_

- [x] 13. Implement the AudioSystem adapter and high-score persistence hook
  - [x] 13.1 Implement `AudioSystem` and wire high-score update on Game_Over
    - Create `src/adapters/audio.js` with `playJump()` (plays `assets/jump.wav`) and `playGameOver()` (plays `assets/game_over.wav`), both swallowing failures so the loop is never interrupted
    - Add a core helper that, on entering Game_Over, computes `highScore = max(score, storedHighScore)` and triggers the game-over sound exactly once via a `gameOverSoundPlayed` flag
    - _Requirements: 3.4, 3.5, 7.4, 8.4_

  - [x] 13.2 Write property test: game-over sound triggers exactly once
    - **Property 18: Game-over sound triggers exactly once**
    - **Validates: Requirements 7.4**

  - [x] 13.3 Write property test: stored high score is the running maximum
    - **Property 19: Stored high score is the running maximum**
    - **Validates: Requirements 8.4**

  - [x] 13.4 Write mock-based test for jump audio resilience
    - Verify a flap triggers `playJump` and that audio failure does not throw or interrupt the tick
    - _Requirements: 3.4, 3.5_

- [x] 14. Implement the AssetLoader adapter
  - [x] 14.1 Implement `AssetLoader.load(deadlineMs)`
    - Create `src/adapters/assetLoader.js` that preloads `assets/ghosty.png`, `img/chiikawa_point.png`, `assets/jump.wav`, and `assets/game_over.wav`, racing against a 5-second deadline; resolve with `LoadedAssets` on success, reject on timeout/error, and surface per-asset sprite failure so the renderer can fall back
    - _Requirements: 1.1, 1.2, 9.2_

  - [x] 14.2 Write integration tests for asset loading paths
    - Using mocked image/audio loading, verify success resolves assets (enabling Loading → Ready) and timeout/error rejects (staying in Loading)
    - _Requirements: 1.1, 1.2_

- [x] 15. Implement the InputController adapter
  - [x] 15.1 Implement `InputController`
    - Create `src/adapters/input.js` that normalizes mouse click, touch tap, and Spacebar key press into a single timestamped `flap` callback, preventing default scrolling on Spacebar/touch
    - _Requirements: 3.7_

  - [x] 15.2 Write unit test for input normalization
    - Verify each of mouse click, touch tap, and Spacebar produces exactly one flap event
    - _Requirements: 3.7_

- [x] 16. Implement the GameLoop adapter
  - [x] 16.1 Implement `GameLoop` over requestAnimationFrame
    - Create `src/adapters/gameLoop.js` that computes delta time per frame, clamps it to 100 ms, invokes a tick callback once per animation frame, and pauses/resumes via the Page Visibility API without applying accumulated time on resume
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 16.2 Write property test: movement is delta-time invariant
    - **Property 22: Movement is delta-time invariant**
    - **Validates: Requirements 10.2**

  - [x] 16.3 Write property test: long frames are clamped
    - **Property 23: Long frames are clamped**
    - **Validates: Requirements 10.3**

- [x] 17. Implement the Renderer adapter
  - [x] 17.1 Implement `Renderer` on Canvas 2D
    - Create `src/adapters/renderer.js` with `resize(width, height)` and `render(world, assets)`; set `imageSmoothingEnabled = false`, draw the ghost from `assets/ghosty.png` (solid-color placeholder plus a "sprite missing" indication when absent), draw collectibles from `img/chiikawa_point.png`, draw pipes, scroll the background while Playing and hold it otherwise, and render the score/high-score in a pixel-style font ≥16 px, including the start prompt (Ready) and final score + restart prompt + high score (Game_Over)
    - _Requirements: 1.4, 1.5, 5.4, 6.5, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 17.2 Write smoke/integration tests for rendering
    - Verify image smoothing is disabled and score font height is ≥16 px on the initialized context; verify ghost placeholder is drawn when the sprite is missing and background scrolls only while Playing (using a mocked 2D context)
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 18. Checkpoint - Ensure all adapter tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement the Game orchestrator and wire the entry point
  - [x] 19.1 Implement the `Game` orchestrator
    - Create `src/game.js` wiring all adapters to the core: `start()` kicks off asset loading and transitions Loading → Ready on success (or shows the error and stays in Loading on failure), `tick(dt)` advances the core step and renders, `handleFlap(now)` routes input into the core (start/flap/restart), and `setVisible(visible)` controls loop pausing; trigger `playJump` on flap and `playGameOver` once on Game_Over, and persist the high score via `HighScoreStore`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.4, 5.5, 7.4, 7.5, 8.3, 8.4, 10.1, 10.4_

  - [x] 19.2 Wire the HTML entry point
    - Create `src/main.js` imported by `index.html` that constructs the canvas-backed adapters and the `Game`, registers input and visibility listeners, calls `Game.start()`, and starts the `GameLoop`
    - _Requirements: 1.1, 2.1, 2.2, 3.7, 10.1_

  - [x] 19.3 Write integration tests for orchestration flows
    - Verify Loading → Ready on asset success vs. staying in Loading on failure; Ready + flap → Playing with pipes scrolling next frame and exactly one impulse; score display updates within one frame; Game_Over shows final score, restart prompt, and stored high score
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 5.5, 8.1, 8.2, 8.3_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (and, for property tests, a specific design property) for traceability.
- All 23 correctness properties are covered by dedicated property-test sub-tasks (Properties 1–23), and the Testing Strategy's unit, mock, and integration tests are covered by the remaining optional sub-tasks.
- Property tests use fast-check with Vitest, a minimum of 100 generated cases per property, and a tagging comment `// Feature: flappy-kiro, Property {number}: {property_text}`.
- Checkpoints provide incremental validation at the boundaries between the core, the adapters, and the final integration.
- Existing workspace assets are reused: `assets/ghosty.png`, `img/chiikawa_point.png`, `assets/jump.wav`, `assets/game_over.wav`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "12.1", "15.1", "16.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "7.1", "8.1", "12.2", "14.1", "15.2", "16.2", "16.3", "17.1"] },
    { "id": 3, "tasks": ["7.2", "7.3", "7.4", "7.5", "8.2", "8.3", "8.4", "8.5", "9.1", "13.1", "14.2", "17.2"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4", "10.1", "13.2", "13.3", "13.4"] },
    { "id": 5, "tasks": ["10.2", "10.3", "19.1"] },
    { "id": 6, "tasks": ["19.2"] },
    { "id": 7, "tasks": ["19.3"] }
  ]
}
```
