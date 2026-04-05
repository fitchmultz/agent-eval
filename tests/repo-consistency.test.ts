/**
 * Purpose: Protects the public repo surface from stale v2 operator-first naming after the v3 cutover.
 * Responsibilities: Scan user-facing files for deprecated report-contract terms and contradictory branding.
 * Scope: Excludes generated output and intentionally historical implementation notes.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Public-facing docs and workflow files should describe the v3 dashboard/learning/review product, not the old operator-first contract.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { listFilesRecursively, pathExists } from "../src/filesystem.js";

const repoRoot = process.cwd();

const publicFiles = [
  "README.md",
  "AGENTS.md",
  "Makefile",
  "package.json",
  "docs/report-v3.md",
  "src/cli.ts",
  "src/cli/main.ts",
  "src/cli/options.ts",
  "src/config/index.ts",
  "src/config/loader.ts",
  "src/config/env.ts",
  "src/config/validation.ts",
  "tests/cli.test.ts",
] as const;

const stalePatterns = [
  "operator-first static report",
  "operator-first static triage",
  "triage-first summary contract",
  "Sessions To Review First",
  "topSessions",
  "executiveSummary",
  "operatorMetrics",
  "endedVerifiedDeliverySpotlights",
  "maxVictoryLaps",
  "maxTopSessions",
  "report-skin",
  "REPORT_SKIN",
  "operator or showcase",
  "CODEX_EVAL_",
  "Phase 5 now hardens the v3 product surface",
  "The current report surface now includes the Phase 4 presentation rebuild",
] as const;

const publicNoteDirectories = ["notes"] as const;
const disallowedPublicPathPatterns = [
  /\/Users\/mitchfultz\b/,
  /\/home\/mitchfultz\b/,
  /C:\\Users\\mitchfultz\b/i,
] as const;

describe("repo consistency", () => {
  it("keeps public-facing files free of stale v2 report-contract language", async () => {
    for (const relativePath of publicFiles) {
      const content = await readFile(join(repoRoot, relativePath), "utf8");
      for (const pattern of stalePatterns) {
        expect(content).not.toContain(pattern);
      }
    }
  });

  it("keeps tracked notes free of real user-specific absolute home paths", async () => {
    const noteFiles: string[] = [];

    for (const relativeDir of publicNoteDirectories) {
      const absoluteDir = join(repoRoot, relativeDir);
      if (!(await pathExists(absoluteDir))) {
        continue;
      }
      noteFiles.push(...(await listFilesRecursively(absoluteDir)));
    }

    const markdownNotes = noteFiles.filter((path) => path.endsWith(".md"));
    const violations: string[] = [];

    for (const file of markdownNotes) {
      const content = await readFile(file, "utf8");
      for (const pattern of disallowedPublicPathPatterns) {
        if (pattern.test(content)) {
          violations.push(relative(repoRoot, file));
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps release-hostile Finder cruft out of shipped directory trees", async () => {
    const releaseDirectories = [
      "src",
      "docs",
      "scripts",
      "tests",
      "notes/final-release/verification",
    ];
    const files: string[] = [];

    for (const relativeDir of releaseDirectories) {
      const absoluteDir = join(repoRoot, relativeDir);
      if (!(await pathExists(absoluteDir))) {
        continue;
      }
      files.push(...(await listFilesRecursively(absoluteDir)));
    }

    const dsStoreFiles = files
      .filter((path) => path.endsWith(".DS_Store"))
      .map((path) => relative(repoRoot, path));

    expect(dsStoreFiles).toEqual([]);
  });

  it("keeps verification screenshots out of the tracked public repo surface", () => {
    const trackedVerificationFiles = execFileSync(
      "git",
      ["ls-files", "notes/final-release/verification"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
      .trim()
      .split("\n")
      .filter((path) => path.length > 0);

    expect(trackedVerificationFiles).toEqual([]);
  });
});
