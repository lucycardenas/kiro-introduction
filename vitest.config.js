import { defineConfig } from 'vitest/config';

// Vitest configuration for the Flappy Kiro no-build ES module project.
// The deterministic simulation core is pure logic, so the default Node
// environment is sufficient. Browser-adapter tests mock their platform APIs.
export default defineConfig({
  test: {
    // Pure core logic runs fine under Node; no DOM needed by default.
    environment: 'node',
    // Discover unit and property tests under test/ and co-located *.test.js files.
    include: ['test/**/*.{test,spec}.js', 'src/**/*.{test,spec}.js'],
    globals: true,
  },
});
