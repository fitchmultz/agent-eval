/**
 * Purpose: Scan generated artifacts and selected tracked repo files for obvious local-path and secret-like leak patterns.
 * Responsibilities: Walk text files, inspect public-surface content, and fail fast on suspicious strings.
 * Scope: Local verification helper for artifact bundles and tracked repo-surface scans.
 * Usage: `node scripts/public-surface-scan.mjs <path...>` or `node scripts/public-surface-scan.mjs --mode=repo <path...>`.
 * Invariants/Assumptions: Exits non-zero on any detected leak pattern outside narrowly allowlisted implementation fixtures.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const TEXT_EXTENSIONS_BY_MODE = {
  artifacts: new Set([".json", ".jsonl", ".md", ".html", ".svg"]),
  repo: new Set([
    ".json",
    ".jsonl",
    ".md",
    ".html",
    ".svg",
    ".ts",
    ".js",
    ".mjs",
    ".cjs",
  ]),
};

const LEAK_PATTERNS = [
  { label: "absolute-macos-home", regex: /\/Users\//g },
  { label: "private-var-folders", regex: /\/private\/var\/folders\//g },
  {
    label: "encoded-user-segment",
    regex: /(^|[^A-Za-z])Users-[A-Za-z0-9._-]+(?:-[A-Za-z0-9._-]+){1,}/g,
  },
  { label: "encoded-temp-root", regex: /-private-var-folders-[A-Za-z0-9._-]+/g },
  { label: "windows-user-home", regex: /[A-Za-z]:\\Users\\/g },
  { label: "linux-home", regex: /\/home\/[^/]+\//g },
  { label: "ssh-directory", regex: /\.ssh\//g },
  {
    label: "private-key-block",
    regex: /BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY/g,
  },
  { label: "github-token", regex: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: "generic-bearer-token", regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
];

const REPO_MODE_ALLOWLIST = [
  {
    path: /\/src\/sanitization\.ts$/,
    label: "ssh-directory",
    sample: /\.ssh\//,
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: /.*/,
    sample: /.*/,
  },
];

function printHelp() {
  process.stdout.write(`public-surface-scan\n\n`);
  process.stdout.write(
    `Scans generated artifacts or selected tracked repo files for obvious path and secret leaks.\n\n`,
  );
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs <path...>\n`);
  process.stdout.write(
    `  node scripts/public-surface-scan.mjs --mode=repo README.md docs src scripts\n`,
  );
  process.stdout.write(
    `  node scripts/public-surface-scan.mjs artifacts/final-qa-pi artifacts/benchmark\n`,
  );
  process.stdout.write(`  node scripts/public-surface-scan.mjs --help\n\n`);
  process.stdout.write(
    `Artifact mode extensions: .json, .jsonl, .md, .html, .svg\n`,
  );
  process.stdout.write(
    `Repo mode extensions: .json, .jsonl, .md, .html, .svg, .ts, .js, .mjs, .cjs\n\n`,
  );
  process.stdout.write(`Exit codes:\n`);
  process.stdout.write(`  0 success\n`);
  process.stdout.write(`  1 leak patterns found or scan failure\n`);
  process.stdout.write(`  2 usage error\n`);
}

async function collectFiles(targetPath, files, textExtensions) {
  const targetStat = await stat(targetPath);
  if (targetStat.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectFiles(join(targetPath, entry.name), files, textExtensions);
    }
    return;
  }

  if (textExtensions.has(extname(targetPath))) {
    files.push(targetPath);
  }
}

function isAllowedFinding(mode, filePath, label, sample) {
  if (mode !== "repo") {
    return false;
  }

  return REPO_MODE_ALLOWLIST.some(
    (rule) =>
      rule.path.test(filePath) &&
      (typeof rule.label === "string"
        ? rule.label === label
        : rule.label.test(label)) &&
      rule.sample.test(sample),
  );
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
    printHelp();
    return;
  }

  const modeArg = rawArgs.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "artifacts";
  if (!(mode in TEXT_EXTENSIONS_BY_MODE)) {
    process.stderr.write(`unsupported mode: ${mode}\n`);
    process.exitCode = 2;
    return;
  }

  const args = rawArgs.filter((arg) => !arg.startsWith("--mode="));
  if (args.length === 0) {
    process.stderr.write(
      "public-surface-scan requires at least one file or directory path.\n",
    );
    process.exitCode = 2;
    return;
  }

  const textExtensions = TEXT_EXTENSIONS_BY_MODE[mode];
  const files = [];
  for (const rawPath of args) {
    await collectFiles(resolve(rawPath), files, textExtensions);
  }

  const findings = [];
  for (const filePath of files.sort((left, right) => left.localeCompare(right))) {
    const content = await readFile(filePath, "utf8");
    for (const pattern of LEAK_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(content);
      if (!match || isAllowedFinding(mode, filePath, pattern.label, match[0])) {
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
        mode,
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
