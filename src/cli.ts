#!/usr/bin/env node
/**
 * Purpose: Implements the `codex-eval` CLI entrypoint and dispatches inventory, parse, eval, and report workflows.
 * Entrypoint: `main()` is invoked when the file is run directly or through the package bin.
 * Notes: All commands emit machine-readable data to stdout and write artifacts only when requested by the command.
 */

import { Command } from "commander";

import { discoverArtifacts } from "./discovery.js";
import { evaluateArtifacts, writeEvaluationArtifacts } from "./evaluator.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

interface GlobalOptions {
  codexHome: string;
  outputDir: string;
  sessionLimit?: number;
}

async function runInspectCommand(options: GlobalOptions): Promise<void> {
  const inventory = await discoverArtifacts(options.codexHome);
  process.stdout.write(
    `${JSON.stringify(
      {
        evaluatorVersion: EVALUATOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        codexHome: options.codexHome,
        sessionFileCount: inventory.sessionFiles.length,
        inventory: inventory.inventory,
      },
      null,
      2,
    )}\n`,
  );
}

async function runParseCommand(options: GlobalOptions): Promise<void> {
  const result = await evaluateArtifacts(options);
  await writeEvaluationArtifacts(
    {
      ...result,
      incidents: [],
      metrics: {
        ...result.metrics,
        incidentCount: 0,
      },
      report: "# Parse Only\n",
    },
    options.outputDir,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        evaluatorVersion: EVALUATOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        outputDir: options.outputDir,
        rawTurnCount: result.rawTurns.length,
      },
      null,
      2,
    )}\n`,
  );
}

async function runEvalCommand(options: GlobalOptions): Promise<void> {
  const result = await evaluateArtifacts(options);
  await writeEvaluationArtifacts(result, options.outputDir);
  process.stdout.write(
    `${JSON.stringify(
      {
        evaluatorVersion: EVALUATOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        outputDir: options.outputDir,
        sessionCount: result.metrics.sessionCount,
        incidentCount: result.metrics.incidentCount,
      },
      null,
      2,
    )}\n`,
  );
}

async function runReportCommand(options: GlobalOptions): Promise<void> {
  const result = await evaluateArtifacts(options);
  await writeEvaluationArtifacts(result, options.outputDir);
  process.stdout.write(result.report);
}

export async function main(argv: string[]): Promise<number> {
  const homeEnvironmentKey = "HOME";
  const homeDirectory = process.env[homeEnvironmentKey];
  const defaultCodexHome = homeDirectory ? `${homeDirectory}/.codex` : ".codex";
  const program = new Command();

  program
    .name("codex-eval")
    .description(
      "Evaluate local Codex session artifacts and emit structured reports.",
    )
    .version(EVALUATOR_VERSION)
    .showHelpAfterError()
    .option("--codex-home <path>", "Codex home to inspect", defaultCodexHome)
    .option(
      "--output-dir <path>",
      "Directory for generated evaluator artifacts",
      "artifacts",
    )
    .option(
      "--session-limit <count>",
      "Limit transcript files processed during this run",
      (value) => Number.parseInt(value, 10),
    )
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  codex-eval inspect --codex-home ~/.codex",
        "  codex-eval parse --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval report --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts --session-limit 25",
        "",
        "Exit codes:",
        "  0 success",
        "  1 runtime failure",
        "  2 usage error",
      ].join("\n"),
    );

  program
    .command("inspect")
    .description("Discover canonical and optional local Codex artifact stores.")
    .action(async () => {
      await runInspectCommand(program.opts<GlobalOptions>());
    });

  program
    .command("parse")
    .description("Parse transcript files and emit raw turn artifacts.")
    .action(async () => {
      await runParseCommand(program.opts<GlobalOptions>());
    });

  program
    .command("eval")
    .description(
      "Run parsing, labeling, clustering, scoring, and artifact emission.",
    )
    .action(async () => {
      await runEvalCommand(program.opts<GlobalOptions>());
    });

  program
    .command("report")
    .description(
      "Generate the markdown evaluator report and write all artifacts.",
    )
    .action(async () => {
      await runReportCommand(program.opts<GlobalOptions>());
    });

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main(process.argv);
  process.exit(exitCode);
}
