/**
 * Purpose: Copy non-TypeScript runtime assets into dist after compilation.
 * Responsibilities: Materialize bundled CSS and synthetic calibration fixtures required by the built CLI.
 * Scope: Build-time helper for local/public release packaging only.
 * Usage: `node scripts/copy-runtime-assets.mjs` or `node scripts/copy-runtime-assets.mjs --help`.
 * Invariants/Assumptions: Run after `tsc` so `dist/` already exists and mirrors the source module layout.
 */

import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function printHelp() {
  process.stdout.write(`copy-runtime-assets\n\n`);
  process.stdout.write(`Copies runtime asset files into dist after TypeScript compilation.\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/copy-runtime-assets.mjs\n`);
  process.stdout.write(`  node scripts/copy-runtime-assets.mjs --help\n\n`);
  process.stdout.write(`Copies:\n`);
  process.stdout.write(`  - src/styles/report.css -> dist/styles/report.css\n`);
  process.stdout.write(
    `  - src/calibration/fixtures/*.jsonl -> dist/calibration/fixtures/\n\n`,
  );
  process.stdout.write(`Exit codes:\n`);
  process.stdout.write(`  0 success\n`);
  process.stdout.write(`  1 asset copy failure\n`);
}

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const distStylesDir = join(repoRoot, "dist", "styles");
  const distCalibrationDir = join(repoRoot, "dist", "calibration");

  await mkdir(distStylesDir, { recursive: true });
  await mkdir(join(distCalibrationDir, "fixtures"), { recursive: true });

  await cp(
    join(repoRoot, "src", "styles", "report.css"),
    join(distStylesDir, "report.css"),
  );
  await cp(
    join(repoRoot, "src", "calibration", "fixtures"),
    join(distCalibrationDir, "fixtures"),
    { recursive: true },
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`copy-runtime-assets failed: ${message}\n`);
  process.exitCode = 1;
});
