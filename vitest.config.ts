import { defineConfig } from "vitest/config";

// Two projects: this repository's NEAR code (test/) and the pre-existing engine's own suite (engine/test/).
// The engine's tests read paths relative to engine/, so that project runs in forks that chdir there.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "near", include: ["test/**/*.test.ts"], testTimeout: 20_000 } },
      { test: { name: "engine", include: ["engine/test/**/*.test.ts"], pool: "forks", setupFiles: ["test/setup-engine.ts"], testTimeout: 20_000 } },
    ],
  },
});
