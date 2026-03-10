# Storage Inventory

Date grounded with `date`: `Fri Mar 6 11:46:22 MST 2026`

This is an early Codex-specific discovery note from the initial exploration pass. It is kept as reference material, not as the current product contract. The implemented evaluator is now source-aware and also supports Claude Code homes.

## Summary

Observed local Codex artifacts under `/Users/mitchfultz/.codex` strongly suggest a two-tier design:

1. Canonical transcript artifacts:
   - `sessions/YYYY/MM/DD/rollout-*.jsonl`
2. Local enrichment/index artifacts:
   - `state_5.sqlite`
   - `log/codex-tui.log`
   - `history.jsonl`
   - `sqlite/codex-dev.db`
   - `shell_snapshots/*.sh`

The portable methodology should treat transcript JSONL as required input and all other stores as optional enrichment.

## Observed Artifact Inventory

### `~/.codex/sessions`

- Observed path pattern: `/Users/mitchfultz/.codex/sessions/YYYY/MM/DD/rollout-<iso-ish>-<thread-id>.jsonl`
- Observed file count by extension under `sessions`: about `7395` `.jsonl`
- Observed example:
  - `/Users/mitchfultz/.codex/sessions/2026/03/06/rollout-2026-03-06T11-46-56-019cc479-6779-74f3-9817-dc3f7a93e025.jsonl`
- Why it matters:
  - Contains ordered session events
  - Contains tool calls and tool outputs
  - Contains user/assistant messages
  - Contains turn context and session metadata
  - Supports parent/subagent linkage when present
- Recommendation:
  - Required canonical input

### `~/.codex/state_5.sqlite`

- Observed path: `/Users/mitchfultz/.codex/state_5.sqlite`
- Observed sidecars:
  - `state_5.sqlite-shm`
  - `state_5.sqlite-wal`
- Observed tables:
  - `_sqlx_migrations`
  - `agent_job_items`
  - `agent_jobs`
  - `backfill_state`
  - `jobs`
  - `logs`
  - `stage1_outputs`
  - `thread_dynamic_tools`
  - `threads`
- Observed rough cardinalities:
  - `threads`: `7291`
  - `logs`: `2297328`
  - `thread_dynamic_tools`: `0`
  - `stage1_outputs`: `166`
- Why it matters:
  - Fast lookup of threads and rollout paths
  - Local metadata not always convenient to derive by scanning all JSONL
  - Log correlation via `thread_id`
- Recommendation:
  - Optional enrichment only

### `~/.codex/log/codex-tui.log`

- Observed path: `/Users/mitchfultz/.codex/log/codex-tui.log`
- Observed line count: about `3953030`
- Why it matters:
  - Rich local operational log
  - Includes `ToolCall:` lines with serialized tool arguments
  - Helpful for correlation or gap-filling when JSONL is incomplete
- Caveat:
  - Very large
  - Operational log, not portable
  - Likely to contain secrets or raw command args
- Recommendation:
  - Optional enrichment only

### `~/.codex/history.jsonl`

- Observed path: `/Users/mitchfultz/.codex/history.jsonl`
- Observed line count: about `11572`
- Why it matters:
  - Cheap way to inspect user prompt history
  - Useful if transcript files are missing or partially pruned
- Caveat:
  - Prompt-centric and incomplete for turn/tool reconstruction
- Recommendation:
  - Optional enrichment only

### `~/.codex/sqlite/codex-dev.db`

- Observed path: `/Users/mitchfultz/.codex/sqlite/codex-dev.db`
- Observed tables:
  - `automations`
  - `automation_runs`
  - `inbox_items`
- Why it matters:
  - May explain automated or inbox-driven threads
- Caveat:
  - Looks product-specific and not essential for general session evaluation
- Recommendation:
  - Optional enrichment only, and likely ignored in v1 unless evaluating automation runs

### `~/.codex/shell_snapshots/*.sh`

- Observed directory: `/Users/mitchfultz/.codex/shell_snapshots`
- Observed file count: `86`
- Observed naming pattern:
  - `<thread-id>.sh`
- Why it matters:
  - Captures shell environment/init snapshot for a thread
- Caveat:
  - Not execution history
  - Not reliable evidence of commands run, file writes, or outcomes
- Recommendation:
  - Optional environment enrichment at most
  - Exclude from required methodology

## Canonical vs Optional

### Canonical Required Input

- `~/.codex/sessions/**/*.jsonl`

### Optional Enrichment Inputs

- `~/.codex/state_5.sqlite`
- `~/.codex/log/codex-tui.log`
- `~/.codex/history.jsonl`
- `~/.codex/sqlite/codex-dev.db`
- `~/.codex/shell_snapshots/*.sh`

## Portable Discovery Rules

- Start from common Codex home conventions rather than fixed absolute paths.
- Discover candidate roots dynamically, then probe for:
  - `sessions/**/*.jsonl`
  - `state_*.sqlite`
  - `history.jsonl`
  - `log/*.log`
  - `sqlite/*.db`
  - `shell_snapshots/*.sh`
- Treat any store other than transcript JSONL as optional, even if locally present.

## Caveats

- Schema and tool naming drift across CLI versions is expected.
- SQLite filenames may be versioned and unstable.
- Some threads are subagents and should be linked into parent-child trees instead of treated as unrelated sessions.
- Local logs and command outputs may expose raw paths, prompts, or secrets, so the evaluator should normalize and redact before exporting.
