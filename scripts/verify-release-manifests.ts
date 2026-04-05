/**
 * Purpose: Verify committed release manifests describe a clean, current, schema-valid release snapshot.
 * Responsibilities: Validate manifest schema, require clean/current git provenance, recompute config fingerprints, verify artifact inventory, and exit non-zero on any mismatch.
 * Scope: Local release-signoff helper for generated final QA bundles.
 * Usage: `pnpm exec tsx scripts/verify-release-manifests.ts <manifest-or-dir...>` or `--help`.
 * Invariants/Assumptions: Runs from the repo root, targets generated bundle directories or manifest files, and treats any mismatch as release-blocking.
 */

import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { initializeConfig } from "../src/config/index.js";
import {
  computeReleaseConfigFingerprint,
  releaseManifestSchema,
} from "../src/release-manifest.js";

function printHelp() {
  process.stdout.write("verify-release-manifests\n\n");
  process.stdout.write(
    "Verifies that bundled release manifests came from the current clean branch tip and still match the live manifest contract.\n\n",
  );
  process.stdout.write("Usage:\n");
  process.stdout.write(
    "  pnpm exec tsx scripts/verify-release-manifests.ts artifacts/final-qa-codex artifacts/final-qa-pi\n",
  );
  process.stdout.write(
    "  pnpm exec tsx scripts/verify-release-manifests.ts artifacts/final-qa-codex/release-manifest.json\n",
  );
  process.stdout.write("  pnpm exec tsx scripts/verify-release-manifests.ts --help\n\n");
  process.stdout.write("Exit codes:\n");
  process.stdout.write("  0 all manifests match the live release contract\n");
  process.stdout.write("  1 verification failure or read error\n");
  process.stdout.write("  2 usage error\n");
}

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function resolveManifestPath(rawPath: string): Promise<string> {
  const absolutePath = resolve(rawPath);
  const targetStat = await stat(absolutePath);
  if (targetStat.isDirectory()) {
    return join(absolutePath, "release-manifest.json");
  }
  return absolutePath;
}

async function listBundleFiles(bundleDir: string): Promise<string[]> {
  const entries = await readdir(bundleDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function compareSortedLists(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  return actual.every((value, index) => value === expected[index]);
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
  let headBranch = "";
  try {
    await initializeConfig({ cwd: process.cwd() });
    headCommit = runGit(["rev-parse", "HEAD"]);
    headBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`verify-release-manifests failed: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const findings: string[] = [];

  for (const rawPath of args) {
    const manifestPath = await resolveManifestPath(rawPath);
    const bundleDir = resolve(join(manifestPath, ".."));
    const manifestRaw = JSON.parse(await readFile(manifestPath, "utf8"));
    const parsedManifest = releaseManifestSchema.safeParse(manifestRaw);

    if (!parsedManifest.success) {
      findings.push(
        `${manifestPath}: manifest schema validation failed: ${parsedManifest.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
          .join("; ")}`,
      );
      continue;
    }

    const manifest = parsedManifest.data;
    if (manifest.git.dirty !== false) {
      findings.push(
        `${manifestPath}: expected git.dirty === false, received ${JSON.stringify(manifest.git.dirty)}`,
      );
    }
    if (manifest.git.commit !== headCommit) {
      findings.push(
        `${manifestPath}: expected git.commit === ${headCommit}, received ${JSON.stringify(manifest.git.commit)}`,
      );
    }
    if (manifest.git.branch !== headBranch) {
      findings.push(
        `${manifestPath}: expected git.branch === ${headBranch}, received ${JSON.stringify(manifest.git.branch)}`,
      );
    }

    const expectedFingerprint = computeReleaseConfigFingerprint({
      evaluation: manifest.evaluation,
      corpusScope: manifest.corpusScope,
      appliedFilters: manifest.appliedFilters,
    });
    if (manifest.configFingerprint !== expectedFingerprint) {
      findings.push(
        `${manifestPath}: expected configFingerprint === ${expectedFingerprint}, received ${JSON.stringify(manifest.configFingerprint)}`,
      );
    }

    const actualFiles = await listBundleFiles(bundleDir);
    const expectedFiles = [...manifest.artifactFiles].sort();
    if (!compareSortedLists(actualFiles, expectedFiles)) {
      findings.push(
        `${manifestPath}: artifactFiles inventory mismatch. expected ${JSON.stringify(expectedFiles)}, received ${JSON.stringify(actualFiles)}`,
      );
    }

    if (basename(manifestPath) !== "release-manifest.json") {
      findings.push(
        `${manifestPath}: expected release manifest filename release-manifest.json`,
      );
    }
  }

  if (findings.length > 0) {
    process.stderr.write("verify-release-manifests found mismatches:\n");
    for (const finding of findings) {
      process.stderr.write(`- ${finding}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify-release-manifests failed: ${message}\n`);
  process.exitCode = 1;
});
