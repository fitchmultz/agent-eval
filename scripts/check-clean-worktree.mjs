/**
 * Purpose: Enforce release-safe git state before and after local release-signoff commands.
 * Responsibilities: Detect dirty worktrees, optionally require the `main` branch, optionally require the local branch to match its upstream, and exit non-zero when release validation is not reproducible.
 * Scope: Local release-check helper only.
 * Usage: `node scripts/check-clean-worktree.mjs [--require-main] [--require-upstream-clean]` or `--help`.
 * Invariants/Assumptions: Runs from the repository root and treats any git status porcelain output as release-blocking.
 */

import { execFileSync } from "node:child_process";

function printHelp() {
  process.stdout.write("check-clean-worktree\n\n");
  process.stdout.write(
    "Fails when the local git state is not safe for reproducible release signoff.\n\n",
  );
  process.stdout.write("Usage:\n");
  process.stdout.write(
    "  node scripts/check-clean-worktree.mjs [--require-main] [--require-upstream-clean]\n",
  );
  process.stdout.write("  node scripts/check-clean-worktree.mjs --help\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --require-main            Fail unless the current branch is main\n");
  process.stdout.write(
    "  --require-upstream-clean  Fail unless HEAD exactly matches its upstream tracking branch\n\n",
  );
  process.stdout.write("Exit codes:\n");
  process.stdout.write("  0 release-safe git state\n");
  process.stdout.write("  1 dirty worktree, branch mismatch, upstream mismatch, or git error\n");
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message, details = []) {
  process.stderr.write(`${message}\n`);
  for (const detail of details) {
    process.stderr.write(`${detail}\n`);
  }
  process.exitCode = 1;
}

function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const requireMain = process.argv.includes("--require-main");
  const requireUpstreamClean = process.argv.includes("--require-upstream-clean");

  let output = "";
  try {
    output = runGit(["status", "--porcelain"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`check-clean-worktree failed: ${message}`);
    return;
  }

  if (output.length > 0) {
    const previewLines = output.split("\n").slice(0, 20);
    fail(
      "Release check requires a clean git worktree. Commit, stash, or clean local changes before running release signoff.",
      previewLines.length === output.split("\n").length
        ? previewLines
        : [...previewLines, "..."],
    );
    return;
  }

  if (!requireMain && !requireUpstreamClean) {
    return;
  }

  try {
    if (requireMain) {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (branch !== "main") {
        fail(`Release check requires branch main. Current branch: ${branch}`);
        return;
      }
    }

    if (requireUpstreamClean) {
      const upstream = runGit([
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
      const [behindRaw, aheadRaw] = runGit([
        "rev-list",
        "--left-right",
        "--count",
        `${upstream}...HEAD`,
      ]).split(/\s+/);
      const behind = Number.parseInt(behindRaw ?? "0", 10);
      const ahead = Number.parseInt(aheadRaw ?? "0", 10);
      if (behind !== 0 || ahead !== 0) {
        fail(
          `Release check requires HEAD to match upstream exactly. Upstream: ${upstream}`,
          [`behind=${behind} ahead=${ahead}`],
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`check-clean-worktree failed: ${message}`);
  }
}

main();
