/**
 * Purpose: Scan generated public artifacts for obvious local-path and secret-like leak patterns.
 * Responsibilities: Walk artifact files, inspect text outputs, and fail fast on suspicious public-surface strings.
 * Scope: Local verification helper for generated JSON, JSONL, Markdown, HTML, and SVG artifacts.
 * Usage: `node scripts/public-surface-scan.mjs <path...>` or `node scripts/public-surface-scan.mjs --help`.
 * Invariants/Assumptions: Intended for artifact outputs, not arbitrary source trees; exits non-zero on any detected leak pattern.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const TEXT_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".html", ".svg"]);
const LEAK_PATTERNS = [
  { label: "absolute-macos-home", regex: /\/Users\//g },
  { label: "private-var-folders", regex: /\/private\/var\/folders\//g },
  { label: "encoded-user-segment", regex: /(^|[^A-Za-z])Users-[A-Za-z0-9._-]+(?:-[A-Za-z0-9._-]+){1,}/g },
  { label: "encoded-temp-root", regex: /-private-var-folders-[A-Za-z0-9._-]+/g },
  { label: "windows-user-home", regex: /[A-Za-z]:\\Users\\/g },
  { label: "linux-home", regex: /\/home\/[^/]+\//g },
  { label: "ssh-directory", regex: /\.ssh\//g },
  { label: "private-key-block", regex: /BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY/g },
  { label: "github-token", regex: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: "generic-bearer-token", regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
];

function printHelp() {
  process.stdout.write(`public-surface-scan\n\n`);
  process.stdout.write(`Scans generated artifact files for obvious path and secret leaks.\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs <path...>\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs artifacts/final-qa-pi artifacts/benchmark\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs --help\n\n`);
  process.stdout.write(`Scanned extensions: .json, .jsonl, .md, .html, .svg\n\n`);
  process.stdout.write(`Exit codes:\n`);
  process.stdout.write(`  0 success\n`);
  process.stdout.write(`  1 leak patterns found or scan failure\n`);
  process.stdout.write(`  2 usage error\n`);
}

async function collectFiles(targetPath, files) {
  const targetStat = await stat(targetPath);
  if (targetStat.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectFiles(join(targetPath, entry.name), files);
    }
    return;
  }

  if (TEXT_EXTENSIONS.has(extname(targetPath))) {
    files.push(targetPath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }
  if (args.length === 0) {
    process.stderr.write(
      "public-surface-scan requires at least one file or directory path.\n",
    );
    process.exitCode = 2;
    return;
  }

  const files = [];
  for (const rawPath of args) {
    await collectFiles(resolve(rawPath), files);
  }

  const findings = [];
  for (const filePath of files.sort((left, right) => left.localeCompare(right))) {
    const content = await readFile(filePath, "utf8");
    for (const pattern of LEAK_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(content);
      if (!match) {
        continue;
      }
      findings.push({
        filePath,
        label: pattern.label,
        sample: match[0],
      });
    }
  }

  if (findings.length > 0) {
    process.stderr.write("public-surface-scan found suspicious artifact content:\n");
    for (const finding of findings) {
      process.stderr.write(
        `- ${finding.label}: ${finding.filePath} :: ${finding.sample}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    JSON.stringify(
      {
        scannedFileCount: files.length,
        scannedTargets: args,
        status: "ok",
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`public-surface-scan failed: ${message}\n`);
  process.exitCode = 1;
});
