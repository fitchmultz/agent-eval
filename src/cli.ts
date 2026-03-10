#!/usr/bin/env node
/**
 * Purpose: Public CLI entrypoint for agent-eval.
 * Responsibilities: Re-export the main CLI runtime and execute it when invoked as a script.
 * Scope: Keeps the stable import path `src/cli.ts` while the runtime lives in focused CLI modules.
 * Usage: `agent-eval ...` or `pnpm exec tsx src/cli.ts ...`.
 * Invariants/Assumptions: The external CLI contract remains source-aware and local-first.
 */

export { main } from "./cli/main.js";

import { main } from "./cli/main.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main(process.argv);
  process.exit(exitCode);
}
