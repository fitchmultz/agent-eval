#!/usr/bin/env node
/**
 * Purpose: Implements the `codex-eval` CLI entrypoint and top-level subcommand help.
 * Entrypoint: `main()` is invoked when the file is run directly or via the package bin.
 * Notes: Subcommands are scaffolded first so each implementation checkpoint remains runnable.
 */
import { Command, InvalidArgumentError } from "commander";

import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

const commandNames = ["inspect", "parse", "eval", "report"] as const;
type CommandName = (typeof commandNames)[number];

interface GlobalOptions {
  codexHome: string;
  outputDir: string;
}

function parseCommandName(value: string): CommandName {
  if (commandNames.includes(value as CommandName)) {
    return value as CommandName;
  }

  throw new InvalidArgumentError(`Unsupported command: ${value}`);
}

async function runScaffoldCommand(
  name: CommandName,
  options: GlobalOptions,
): Promise<void> {
  const payload = {
    command: name,
    codexHome: options.codexHome,
    outputDir: options.outputDir,
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "scaffold_ready",
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function main(argv: string[]): Promise<number> {
  const program = new Command();
  const homeEnvironmentKey = "HOME";
  const homeDirectory = process.env[homeEnvironmentKey];
  const defaultCodexHome = homeDirectory ? `${homeDirectory}/.codex` : ".codex";

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
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  codex-eval inspect --codex-home ~/.codex",
        "  codex-eval parse --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval report --codex-home ~/.codex --output-dir artifacts",
        "",
        "Exit codes:",
        "  0 success",
        "  1 runtime failure",
        "  2 usage error",
      ].join("\n"),
    );

  for (const commandName of commandNames) {
    program
      .command(commandName)
      .description(`Scaffolded ${commandName} command`)
      .action(async () => {
        const options = program.opts<GlobalOptions>();
        await runScaffoldCommand(parseCommandName(commandName), options);
      });
  }

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
