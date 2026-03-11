/**
 * Purpose: Protects the public repo surface from stale Codex-era naming after the multi-source cutover.
 * Responsibilities: Scan user-facing files for deprecated CLI/config references and contradictory branding.
 * Scope: Excludes generated output and intentionally historical implementation notes.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Public-facing docs and workflow files should use source-aware naming only.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const publicFiles = [
  "README.md",
  "AGENTS.md",
  "Makefile",
  "package.json",
  "docs/case-study.md",
  "src/cli.ts",
  "src/config/loader.ts",
  "src/config/env.ts",
  "tests/cli.test.ts",
] as const;

const stalePatterns = [
  "--codex-home",
  ".codex-evalrc",
  "codex-eval.config.json",
  "CODEX_EVAL_CODEX_HOME",
  "codexHome",
  "codex-eval",
  "Transcript-first analytics engine for developer AI agents",
  "Codex session artifacts",
] as const;

describe("repo consistency", () => {
  it("keeps public-facing files free of stale codex-era surface area", async () => {
    for (const relativePath of publicFiles) {
      const content = await readFile(join(repoRoot, relativePath), "utf8");
      for (const pattern of stalePatterns) {
        expect(content).not.toContain(pattern);
      }
    }
  });
});
