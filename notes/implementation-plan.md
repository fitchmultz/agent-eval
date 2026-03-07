# Implementation Plan

This plan now tracks the implemented architecture and the next strictly logical expansions.

## Implemented Architecture

The evaluator currently has four stable layers:

1. Discovery
   - dynamically finds transcript JSONL and optional local enrichment stores
2. Ingestion
   - parses canonical transcript JSONL into reconstructed sessions and turns
3. Evaluation
   - labels user-facing friction signals
   - clusters incidents
   - scores AGENTS-style compliance
   - aggregates corpus/session metrics
4. Reporting
   - emits machine-readable artifacts
   - emits deterministic markdown/html/svg derivatives

## Canonical Inputs

- `~/.codex/sessions/**/*.jsonl`

These remain the only required inputs for deterministic v1 evaluation.

## Optional Enrichment Inputs

- `~/.codex/state_5.sqlite`
- `~/.codex/history.jsonl`
- `~/.codex/log/codex-tui.log`
- `~/.codex/sqlite/codex-dev.db`
- `~/.codex/shell_snapshots/*.sh`

These are still inventoried, but not required and not deeply joined into scoring.

## Implemented Data Model Entities

- `RawTurnRecord`
- `IncidentRecord`
- `MetricsRecord`
- `SummaryArtifact`
- `InventoryRecord`

## Implemented Label Taxonomy

- `context_drift`
- `test_build_lint_failure_complaint`
- `interrupt`
- `regression_report`
- `praise`
- `context_reinjection`
- `verification_request`
- `stalled_or_guessing`

## Implemented Compliance Rules

- `scope_confirmed_before_major_write`
- `cwd_or_repo_echoed_before_write`
- `short_plan_before_large_change`
- `verification_after_code_changes`
- `no_unverified_ending`

## Implemented Metrics

Per corpus:

- session count
- turn count
- incident count
- label counts
- compliance rollups
- delivery coverage
- comparative slices

Per session:

- turn count
- labeled-turn count
- incident count
- write count
- verification counts
- compliance score

## Implemented CLI Surface

- `inspect`
- `parse`
- `eval`
- `report`

Important options:

- `--codex-home`
- `--output-dir`
- `--session-limit`
- `--summary-only`

## Outputs

Canonical:

- `artifacts/raw-turns.jsonl`
- `artifacts/incidents.jsonl`
- `artifacts/metrics.json`
- `artifacts/summary.json`

Derived:

- `artifacts/report.md`
- `artifacts/report.html`
- `artifacts/label-counts.svg`
- `artifacts/compliance-summary.svg`
- `artifacts/severity-breakdown.svg`

## Completed Refactor Passes

- evaluator full vs summary-only aggregation paths were consolidated
- duplicated artifact-writing logic was consolidated
- the oversized insight layer was split into focused modules
- report and presentation now share section-level derived data
- planning docs were aligned with the implemented model

## Next Logical Expansions

Only expand beyond the current implementation if one of these becomes worth the added complexity:

1. join optional enrichment stores into deterministic scoring
2. add new labels or compliance rules with strong user value
3. add export/dashboard formats beyond the current markdown/html/svg bundle
4. add a clearly optional second-pass LLM layer on top of deterministic artifacts

## Anti-Goals For Now

- no mandatory SQLite dependence
- no opaque model-based scoring in the core path
- no richer normalized event model unless it clearly reduces net complexity
