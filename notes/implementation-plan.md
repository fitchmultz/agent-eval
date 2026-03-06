# Implementation Plan

This is an exploration-only plan. Do not implement the evaluator until this plan is accepted.

## Recommended Architecture

Build the evaluator as a pipeline with four layers:

1. Discovery
   - find local artifact roots dynamically
2. Ingestion
   - parse canonical transcript JSONL
   - optionally ingest enrichment stores
3. Normalization
   - convert all observed shapes into the typed core schema
4. Evaluation
   - derive labels, incidents, compliance scores, metrics, and markdown/JSON outputs

This architecture keeps the portable methodology centered on transcript truth while letting local-only stores improve coverage without becoming mandatory.

## Canonical Inputs

- `~/.codex/sessions/**/*.jsonl`

Why:

- Most portable observed source
- Already ordered
- Contains session metadata, turn context, messages, tool calls, tool outputs, and outcome signals
- Supports subagent linkage

## Optional Enrichment Inputs

- `~/.codex/state_5.sqlite`
  - thread metadata
  - fast session lookup
  - local log correlation
- `~/.codex/log/codex-tui.log`
  - extra tool-call evidence
  - operational troubleshooting
- `~/.codex/history.jsonl`
  - prompt history fallback
- `~/.codex/sqlite/codex-dev.db`
  - automation and inbox context
- `~/.codex/shell_snapshots/*.sh`
  - environment context only

## Data Model Entities

- `EvalCorpus`
- `EvalSession`
- `EvalTurn`
- `EvalMessage`
- `ToolInvocation`
- `ToolEffect`
- `ReasoningRecord`
- `AuxiliaryEvent`
- `VerificationCommand`
- `EvalIncident`
- `InventoryRecord`

## Label Taxonomy

Use a deliberately small v1 taxonomy:

- `missing_verification`
  - writes happened but no convincing verification followed
- `failed_verification`
  - explicit failed test/lint/build/CI signal
- `unverified_write`
  - high-confidence file write with no pass signal later in the session
- `repeated_failed_attempt`
  - same or similar verification appears to fail multiple times
- `policy_mismatch`
  - turn context or instructions conflict with actions taken
- `incomplete_outcome`
  - session ends without clear resolution after substantive work
- `secret_exposure_risk`
  - raw command/output/log contains likely secret material
- `schema_drift`
  - unrecognized transcript or enrichment shape encountered
- `orphan_subagent`
  - subagent session exists but parent linkage or merge context is missing

## Incident Clustering Rules

- Cluster by `sessionId` first.
- Within a session, cluster by `turnId` when available.
- Merge adjacent write-related incidents if they refer to the same tool call or same target file/path.
- Merge repeated failed verification commands when normalized command text matches after trimming dynamic tokens.
- Keep failures from separate subagents separate unless explicitly rolled into the parent by linkage metadata.
- Do not merge across sessions unless the only goal is cross-session aggregate metrics.

## Compliance Scoring Rules

Start with a transparent rule-based score from `0` to `100`.

Suggested v1 formula:

- start at `100`
- subtract `30` for each `failed_verification`
- subtract `20` for each `unverified_write`
- subtract `15` for each `missing_verification`
- subtract `10` for each `policy_mismatch`
- subtract `10` for each `incomplete_outcome`
- subtract `5` for each `schema_drift`
- subtract `5` for each `orphan_subagent`
- clamp to `[0, 100]`

Also emit component scores:

- `verification_score`
- `change_safety_score`
- `instruction_compliance_score`
- `reconstruction_confidence_score`

## Metrics To Compute

Per session:

- turn count
- assistant/user message counts
- tool call count
- tool call count by category
- file-write count
- verification command count
- passed verification count
- failed verification count
- subagent count
- first timestamp
- last timestamp
- elapsed wall time
- token usage when available

Across a corpus:

- sessions processed
- sessions with writes
- sessions with verification
- sessions with failed verification
- sessions with subagents
- average compliance score
- label frequency distribution
- tool frequency distribution
- schema drift rate

## Tests To Write

### Discovery Tests

- finds transcript JSONL under dynamically discovered roots
- handles missing optional stores gracefully
- ignores shell snapshots as canonical input

### Parser Tests

- parses `session_meta`, `turn_context`, `response_item`, and `event_msg`
- normalizes `function_call` and `custom_tool_call`
- pairs tool call outputs by `call_id`
- handles encrypted reasoning without failure
- handles unknown event types as `schema_drift`

### Evaluation Tests

- identifies high-confidence file writes
- identifies verification commands and verdicts
- flags unverified writes
- links subagents to parents
- computes stable compliance scores

### Fixture Tests

- use redacted real-world transcript snippets from this machine as golden fixtures
- include at least one older transcript using `custom_tool_call`
- include at least one modern transcript using `function_call`

## CLI Commands To Support

Prefer a small CLI surface:

- `codex-eval inventory`
  - discover and report available local stores
- `codex-eval inspect <session-jsonl>`
  - dump normalized structure for one session
- `codex-eval eval <path-or-root>`
  - evaluate one session file or a corpus root
- `codex-eval report <path-or-root>`
  - emit markdown summary and machine-readable JSON
- `codex-eval schema`
  - print the normalized data model or JSON Schema

Helpful options:

- `--codex-home <path>`
- `--include-enrichment`
- `--format json|markdown|text`
- `--redact`
- `--session-id <id>`

## Implementation Order

1. Build dynamic artifact discovery.
2. Build transcript JSONL parser only.
3. Normalize old and new tool-call shapes.
4. Derive file-write and verification signals.
5. Emit JSON and markdown reports.
6. Add optional SQLite enrichment.
7. Add optional TUI log enrichment.
8. Add scoring and incident clustering.

## Why This Plan

- It keeps v1 precise instead of over-reaching.
- It works even on machines that only have transcript files.
- It isolates local-only enrichment so portability stays intact.
- It creates a stable typed core before any scoring or incident logic is added.
