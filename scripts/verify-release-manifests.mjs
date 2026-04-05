/**
 * Purpose: Verify committed release manifests describe a clean, current release snapshot.
 * Responsibilities: Load release-manifest.json files, require git.dirty === false, and require git.commit to match HEAD.
 * Scope: Local release-signoff helper for generated final QA bundles.
 * Usage: `node scripts/verify-release-manifests.mjs <manifest-or-dir...>` or `--help`.
 * Invariants/Assumptions: Runs from the repo root, targets generated bundle directories or manifest files, and exits non-zero on any mismatch.
 */

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

function printHelp() {
  process.stdout.write("verify-release-manifests\n\n");
  process.stdout.write(
    "Verifies that bundled release manifests came from a clean worktree at the current HEAD.\n\n",
  );
  process.stdout.write("Usage:\n");
  process.stdout.write(
    "  node scripts/verify-release-manifests.mjs artifacts/final-qa-codex artifacts/final-qa-pi\n",
  );
  process.stdout.write(
    "  node scripts/verify-release-manifests.mjs artifacts/final-qa-codex/release-manifest.json\n",
  );
  process.stdout.write("  node scripts/verify-release-manifests.mjs --help\n\n");
  process.stdout.write("Exit codes:\n");
  process.stdout.write("  0 all manifests match clean HEAD\n");
  process.stdout.write("  1 verification failure or read error\n");
  process.stdout.write("  2 usage error\n");
}

function readHeadCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function resolveManifestPath(rawPath) {
  const absolutePath = resolve(rawPath);
  const targetStat = await stat(absolutePath);
  if (targetStat.isDirectory()) {
    return join(absolutePath, "release-manifest.json");
  }
  return absolutePath;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }
  if (args.length === 0) {
    process.stderr.write(
      "verify-release-manifests requires at least one bundle directory or release-manifest.json path.\n",
    );
    process.exitCode = 2;
    return;
  }

  let headCommit = "";
  try {
    headCommit = readHeadCommit();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`verify-release-manifests failed: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const findings = [];
  for (const rawPath of args) {
    const manifestPath = await resolveManifestPath(rawPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const dirty = manifest?.git?.dirty;
    const commit = manifest?.git?.commit;

    if (dirty !== false) {
      findings.push(
        `${manifestPath}: expected git.dirty === false, received ${JSON.stringify(dirty)}`,
      );
    }
    if (commit !== headCommit) {
      findings.push(
        `${manifestPath}: expected git.commit === ${headCommit}, received ${JSON.stringify(commit)}`,
      );
    }
  }

  if (findings.length > 0) {
    process.stderr.write("verify-release-manifests found mismatches:\n");
    for (const finding of findings) {
      process.stderr.write(`- ${finding}\n`);
    }
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify-release-manifests failed: ${message}\n`);
  process.exitCode = 1;
});
