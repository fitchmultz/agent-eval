/**
 * Purpose: Verifies the CLI scaffold remains runnable and exposes versioned output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: This is a smoke test for the first implementation checkpoint.
 */
import { describe, expect, it } from "vitest";

import { main } from "../src/cli.js";

describe("cli scaffold", () => {
  it("runs the inspect command without error", async () => {
    const exitCode = await main([
      "node",
      "codex-eval",
      "--codex-home",
      "/tmp/example-codex",
      "inspect",
    ]);

    expect(exitCode).toBe(0);
  });
});
