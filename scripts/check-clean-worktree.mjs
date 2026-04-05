/**
 * Purpose: Enforce a clean git worktree for release-signoff commands.
 * Responsibilities: Detect tracked and untracked changes, print a concise failure message, and exit non-zero when release validation runs on a dirty tree.
 * Scope: Local release-check helper only.
 * Usage: `node scripts/check-clean-worktree.mjs` or `node scripts/check-clean-worktree.mjs --help`.
 * Invariants/Assumptions: Runs from the repository root and treats any git status porcelain output as release-blocking.
 */

import { execFileSync } from "node:child_process";

function printHelp() {
  process.stdout.write("check-clean-worktree\n\n");
  process.stdout.write(
    "Fails when the current git worktree is dirty so release-signoff runs stay reproducible.\n\n",
  );
  process.stdout.write("Usage:\n");
  process.stdout.write("  node scripts/check-clean-worktree.mjs\n");
  process.stdout.write("  node scripts/check-clean-worktree.mjs --help\n\n");
  process.stdout.write("Exit codes:\n");
  process.stdout.write("  0 clean worktree\n");
  process.stdout.write("  1 dirty worktree or git error\n");
}

function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printHelp();
    return;
  }

  let output = "";
  try {
    output = execFileSync("git", ["status", "--porcelain"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`check-clean-worktree failed: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (output.length === 0) {
    return;
  }

  process.stderr.write(
    "Release check requires a clean git worktree. Commit, stash, or clean local changes before running release signoff.\n",
  );
  const previewLines = output.split("\n").slice(0, 20);
  for (const line of previewLines) {
    process.stderr.write(`${line}\n`);
  }
  if (output.split("\n").length > previewLines.length) {
    process.stderr.write("...\n");
  }
  process.exitCode = 1;
}

main();
