/**
 * Purpose: Defines the headless Vitest configuration for parser and evaluator tests.
 * Entrypoint: Loaded automatically by `vitest run`.
 * Notes: Uses the Node environment and the repository test directory only.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"]
  }
});
