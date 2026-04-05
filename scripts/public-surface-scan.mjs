/**
 * Purpose: Scan generated artifacts and selected tracked repo files for obvious local-path and secret-like leak patterns.
 * Responsibilities: Walk text files, inspect public-surface content, and fail fast on suspicious strings.
 * Scope: Local verification helper for artifact bundles and tracked repo-surface scans.
 * Usage: `node scripts/public-surface-scan.mjs <path...>` or `node scripts/public-surface-scan.mjs --mode=repo <path...>`.
 * Invariants/Assumptions: Exits non-zero on any detected leak pattern outside narrowly allowlisted implementation fixtures.
 */

import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ARTIFACT_TEXT_EXTENSIONS = new Set([
  ".json",
  ".jsonl",
  ".md",
  ".html",
  ".svg",
]);

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
    lineText: 'match.replace(/~\\/\\.ssh/i, "[redacted-ssh-path]"),',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "absolute-macos-home",
    lineText: '{ label: "absolute-macos-home", regex: /\\/Users\\//g },',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "absolute-macos-home",
    lineText: 'sample: /\\/Users\\//,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "private-var-folders",
    lineText: '{ label: "private-var-folders", regex: /\\/private\\/var\\/folders\\//g },',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "private-var-folders",
    lineText: 'sample: /\\/private\\/var\\/folders\\//,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "ssh-directory",
    lineText: '{ label: "ssh-directory", regex: /\\.ssh\\//g },',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "ssh-directory",
    lineText: 'sample: /\\.ssh\\//,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "encoded-user-segment",
    lineText: 'sample: /-Users-test-project--/,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "encoded-user-segment",
    lineText: 'sample: /-Users-test-project/,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "encoded-user-segment",
    lineText: 'sample: /-Users-example-Projects-AI-agent-eval--/,',
  },
  {
    path: /\/scripts\/public-surface-scan\.mjs$/,
    label: "encoded-temp-root",
    lineText:
      'sample: /-private-var-folders-rf-t1b4c-cn7sgc-f6tkyg0wsk00000gn-T/,',
  },
  {
    path: /\/tests\/corpus-regression\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'expect(artifact).not.toContain("/Users/");',
  },
  {
    path: /\/tests\/corpus-regression\.test\.ts$/,
    label: "private-var-folders",
    lineText: 'expect(artifact).not.toContain("/private/var/folders/");',
  },
  {
    path: /\/tests\/corpus-regression\.test\.ts$/,
    label: "encoded-user-segment",
    lineText: 'expect(artifact).not.toContain("--Users-test-project--");',
  },
  {
    path: /\/tests\/corpus-regression\.test\.ts$/,
    label: "encoded-temp-root",
    lineText:
      '"-private-var-folders-rf-t1b4c-cn7sgc-f6tkyg0wsk00000gn-T",',
  },
  {
    path: /\/tests\/discovery\.test\.ts$/,
    label: "encoded-user-segment",
    lineText:
      'const projectsDir = join(testDir, "projects", "-Users-test-project");',
  },
  {
    path: /\/tests\/discovery\.test\.ts$/,
    label: "encoded-user-segment",
    lineText: '"--Users-test-project",',
  },
  {
    path: /\/tests\/sanitization\.test\.ts$/,
    label: "absolute-macos-home",
    lineText:
      '"See /Users/example/project and email me at dev@example.com for details.",',
  },
  {
    path: /\/tests\/sanitization\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'homeDirectory: "/Users/example",',
  },
  {
    path: /\/tests\/sanitization\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'expect(sanitized).not.toContain("/Users/example");',
  },
  {
    path: /\/tests\/sanitization\.test\.ts$/,
    label: "ssh-directory",
    lineText:
      '"DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/example_id_ed25519 Permission denied (publickey)",',
  },
  {
    path: /\/tests\/sanitization\.test\.ts$/,
    label: "ssh-directory",
    lineText:
      '"See the following: DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/example_id_ed25519",',
  },
  {
    path: /\/tests\/session-display\.test\.ts$/,
    label: "absolute-macos-home",
    lineText:
      'expect(deriveSessionProjectLabel("/Users/example/Downloads", [])).toBe(',
  },
  {
    path: /\/tests\/session-display\.test\.ts$/,
    label: "private-var-folders",
    lineText:
      'deriveSessionProjectLabel("/private/var/folders/rf/t1b4c/T", sourceRefs),',
  },
  {
    path: /\/tests\/session-display\.test\.ts$/,
    label: "encoded-user-segment",
    lineText:
      'path: "~/.pi/agent/sessions/--Users-example-Projects-AI-agent-eval--/2026-04-01T13-20-09-770Z_da2795a9-4b2a-44d8-a617-5400603bb00e.jsonl",',
  },
  {
    path: /\/tests\/session-display\.test\.ts$/,
    label: "encoded-temp-root",
    lineText:
      'path: "~/.claude/projects/-private-var-folders-rf-t1b4c-cn7sgc-f6tkyg0wsk00000gn-T/25751d6d.jsonl",',
  },
  {
    path: /\/tests\/session-ranking\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'cwd: "/Users/example/Projects/AI/agent-eval",',
  },
  {
    path: /\/tests\/session-ranking\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'cwd: "/Users/example/Projects/AI/repeated-project",',
  },
  {
    path: /\/tests\/session-ranking\.test\.ts$/,
    label: "absolute-macos-home",
    lineText: 'cwd: "/Users/example/Projects/AI/another-project",',
  },
  {
    path: /\/tests\/support\/transcript-fixtures\.ts$/,
    label: "encoded-user-segment",
    lineText:
      'const projectsDir = join(homeDir, "projects", "-Users-test-project");',
  },
  {
    path: /\/tests\/support\/transcript-fixtures\.ts$/,
    label: "encoded-user-segment",
    lineText: '"--Users-test-project--",',
  },
  {
    path: /\/tests\/transcript\.test\.ts$/,
    label: "encoded-user-segment",
    lineText:
      'const projectsDir = join(root, "projects", "-Users-test-project");',
  },
  {
    path: /\/tests\/transcript\.test\.ts$/,
    label: "encoded-user-segment",
    lineText:
      'const sessionsDir = join(root, "agent", "sessions", "--Users-test-project");',
  },
];

function printHelp() {
  process.stdout.write(`public-surface-scan\n\n`);
  process.stdout.write(
    `Scans generated artifacts or selected tracked repo files for obvious path and secret leaks.\n\n`,
  );
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs <path...>\n`);
  process.stdout.write(`  node scripts/public-surface-scan.mjs --mode=repo\n`);
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
    `Repo mode scans tracked files discovered via git ls-files (or explicit paths) with a narrow fixture allowlist.\n\n`,
  );
  process.stdout.write(`Exit codes:\n`);
  process.stdout.write(`  0 success\n`);
  process.stdout.write(`  1 leak patterns found or scan failure\n`);
  process.stdout.write(`  2 usage error\n`);
}

async function collectFiles(targetPath, files, mode) {
  const targetStat = await stat(targetPath);
  if (targetStat.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectFiles(join(targetPath, entry.name), files, mode);
    }
    return;
  }

  if (mode === "repo" || ARTIFACT_TEXT_EXTENSIONS.has(extname(targetPath))) {
    files.push(targetPath);
  }
}

function extractLineText(content, index) {
  const lineStart = content.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const rawLineEnd = content.indexOf("\n", index);
  const lineEnd = rawLineEnd === -1 ? content.length : rawLineEnd;
  return content.slice(lineStart, lineEnd).trim();
}

function decodeQuotedLineText(lineText) {
  const match = lineText.match(/^(?:lineText:\s*)?'((?:\\'|[^'])*)',?$/);
  if (!match) {
    return null;
  }

  return match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

function isScannerAllowlistDeclarationLine(filePath, label, lineText) {
  if (!/\/scripts\/public-surface-scan\.mjs$/.test(filePath)) {
    return false;
  }

  const decodedLineText = decodeQuotedLineText(lineText);
  if (!decodedLineText) {
    return false;
  }

  return REPO_MODE_ALLOWLIST.some(
    (rule) => rule.label === label && rule.lineText === decodedLineText,
  );
}

function isAllowedFinding(mode, filePath, label, lineText) {
  if (mode !== "repo") {
    return false;
  }

  if (
    REPO_MODE_ALLOWLIST.some(
      (rule) =>
        rule.path.test(filePath) &&
        rule.label === label &&
        rule.lineText === lineText,
    )
  ) {
    return true;
  }

  return isScannerAllowlistDeclarationLine(filePath, label, lineText);
}

function trackedRepoPaths() {
  return execFileSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .trim()
    .split("\n")
    .filter((path) => path.length > 0);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
    printHelp();
    return;
  }

  const modeArg = rawArgs.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "artifacts";
  if (!["artifacts", "repo"].includes(mode)) {
    process.stderr.write(`unsupported mode: ${mode}\n`);
    process.exitCode = 2;
    return;
  }

  const args = rawArgs.filter((arg) => !arg.startsWith("--mode="));
  const scanTargets =
    mode === "repo" && args.length === 0 ? trackedRepoPaths() : args;
  if (scanTargets.length === 0) {
    process.stderr.write(
      "public-surface-scan requires at least one file or directory path.\n",
    );
    process.exitCode = 2;
    return;
  }

  const files = [];
  for (const rawPath of scanTargets) {
    await collectFiles(resolve(rawPath), files, mode);
  }

  const findings = [];
  for (const filePath of files.sort((left, right) => left.localeCompare(right))) {
    const content = await readFile(filePath, "utf8");
    for (const pattern of LEAK_PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (const match of content.matchAll(pattern.regex)) {
        const lineText = extractLineText(content, match.index ?? 0);
        if (isAllowedFinding(mode, filePath, pattern.label, lineText)) {
          continue;
        }
        findings.push({
          filePath,
          label: pattern.label,
          sample: match[0],
        });
      }
    }
  }

  if (findings.length > 0) {
    process.stderr.write(
      `public-surface-scan found suspicious ${mode === "repo" ? "repo" : "artifact"} content:\n`,
    );
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
        scannedTargets: scanTargets,
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
