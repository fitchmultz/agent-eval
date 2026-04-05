/**
 * Purpose: Verifies the public-surface scanner catches leak-shaped content without reintroducing false negatives in allowlisted fixture files.
 * Responsibilities: Exercises repo-mode scanning against synthetic allowlisted and non-allowlisted files.
 * Scope: Regression coverage for multi-match scanning and line-specific repo allowlist behavior.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: An allowlisted fixture line may pass, but a second leak in the same file must fail.
 */

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scannerPath = resolve("scripts/public-surface-scan.mjs");

async function runRepoScan(files: Record<string, string>) {
  const rootDir = await mkdtemp(join(tmpdir(), "agent-eval-public-scan-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(rootDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  const result = spawnSync(
    process.execPath,
    [
      scannerPath,
      "--mode=repo",
      ...Object.keys(files).map((path) => join(rootDir, path)),
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("public-surface-scan repo mode", () => {
  it("allows the scanner's own intentional regex literal line", async () => {
    const result = await runRepoScan({
      "scripts/public-surface-scan.mjs":
        '{ label: "absolute-macos-home", regex: /\\/Users\\//g },\n',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"status": "ok"');
  });

  it("fails when an allowlisted scanner file also contains a later home-path leak", async () => {
    const result = await runRepoScan({
      "scripts/public-surface-scan.mjs": [
        '{ label: "absolute-macos-home", regex: /\\/Users\\//g },',
        'const leak = "/Users/realperson/project";',
      ].join("\n"),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("absolute-macos-home");
    expect(result.stderr).toContain("/Users/");
  });

  it("fails when an allowlisted test fixture file contains a later encoded-user leak", async () => {
    const result = await runRepoScan({
      "tests/corpus-regression.test.ts": [
        'expect(artifact).not.toContain("--Users-test-project--");',
        'const leak = "--Users-real-private-project--";',
      ].join("\n"),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("encoded-user-segment");
    expect(result.stderr).toContain("Users-real-private-project");
  });

  it("fails for a non-allowlisted repo file with a home-path leak", async () => {
    const result = await runRepoScan({
      "README.md": "leak /Users/realperson/project\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("absolute-macos-home");
    expect(result.stderr).toContain("README.md");
  });
});
