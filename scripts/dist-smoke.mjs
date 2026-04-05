/**
 * Purpose: Smoke-test the built CLI against packaged runtime assets and minimal synthetic inputs.
 * Responsibilities: Verify `dist/cli.js` can run benchmark and eval successfully and emit styled HTML.
 * Scope: Post-build local release validation only.
 * Usage: `node scripts/dist-smoke.mjs` or `node scripts/dist-smoke.mjs --help`.
 * Invariants/Assumptions: Run after `pnpm build`; exits non-zero on any built-artifact regression.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cliPath = join(repoRoot, "dist", "cli.js");

function printHelp() {
  process.stdout.write(`dist-smoke\n\n`);
  process.stdout.write(
    `Smoke-tests the built agent-eval CLI against packaged runtime assets.\n\n`,
  );
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/dist-smoke.mjs\n`);
  process.stdout.write(`  node scripts/dist-smoke.mjs --help\n\n`);
  process.stdout.write(`Checks:\n`);
  process.stdout.write(`  1. node dist/cli.js benchmark --output-dir <tmp>\n`);
  process.stdout.write(
    `  2. node dist/cli.js eval --source codex --home <tmp> --summary-only\n`,
  );
  process.stdout.write(`  3. report.html contains inline CSS content\n\n`);
  process.stdout.write(`Exit codes:\n`);
  process.stdout.write(`  0 success\n`);
  process.stdout.write(`  1 smoke failure\n`);
}

function createCodexSmokeTranscript(sessionId) {
  return `${[
    JSON.stringify({
      timestamp: "2026-03-10T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: "2026-03-10T10:00:00.000Z",
        cwd: "/workspace/demo",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:01.000Z",
      type: "turn_context",
      payload: { turn_id: "turn-1", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:02.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Fix the docs and verify before finishing.",
          },
        ],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:03.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "I will update the docs and verify after the final write.",
          },
        ],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:04.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "apply_patch",
        arguments:
          "*** Begin Patch\n*** Update File: README.md\n+dist smoke\n*** End Patch",
        call_id: `${sessionId}-call-1`,
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: `${sessionId}-call-1`,
        output: "Success",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:06.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "pnpm test" }),
        call_id: `${sessionId}-call-2`,
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:07.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: `${sessionId}-call-2`,
        output: "Process exited with code 0",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:08.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Verification passed after the final write.",
          },
        ],
      },
    }),
  ].join("\n")}
`;
}

async function runCommand(args, cwd) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "agent-eval-dist-smoke-"));

  try {
    const codexHome = join(tempRoot, "codex-home");
    const outputDir = join(tempRoot, "artifacts");
    const benchmarkDir = join(tempRoot, "benchmark");
    const sessionDir = join(codexHome, "sessions", "2026", "03");

    await mkdir(sessionDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      join(sessionDir, "dist-smoke-session.jsonl"),
      createCodexSmokeTranscript("dist-smoke-session"),
      "utf8",
    );

    const benchmarkResult = await runCommand(
      [cliPath, "benchmark", "--output-dir", benchmarkDir],
      repoRoot,
    );
    if (benchmarkResult.code !== 0) {
      throw new Error(
        `dist benchmark failed\nstdout:\n${benchmarkResult.stdout}\nstderr:\n${benchmarkResult.stderr}`,
      );
    }

    const evalResult = await runCommand(
      [
        cliPath,
        "eval",
        "--source",
        "codex",
        "--home",
        codexHome,
        "--output-dir",
        outputDir,
        "--summary-only",
      ],
      repoRoot,
    );
    if (evalResult.code !== 0) {
      throw new Error(
        `dist eval failed\nstdout:\n${evalResult.stdout}\nstderr:\n${evalResult.stderr}`,
      );
    }

    const html = await readFile(join(outputDir, "report.html"), "utf8");
    if (!html.includes("<style>")) {
      throw new Error("dist eval produced report.html without inline style tag.");
    }
    if (!/\.report-shell|body\s*\{/.test(html)) {
      throw new Error(
        "dist eval produced report.html without bundled CSS content.",
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`dist-smoke failed: ${message}\n`);
  process.exitCode = 1;
});
