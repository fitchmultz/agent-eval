# agent-eval

`agent-eval` is a transcript-first analytics engine for developer AI agents. It discovers local session artifacts, normalizes Codex and Claude Code transcripts into one shared model, applies deterministic labeling and compliance heuristics, and emits machine-readable artifacts plus shareable reports.

This repo is intentionally built for methodology discipline rather than demo flash. The canonical outputs are JSON and JSONL. The markdown, HTML, and SVG layers are deterministic derivatives that make the results easier to share with engineers, managers, and hiring panels without turning the analytics engine into an opaque black box.

## Why this project exists

Teams adopting coding agents need a repeatable way to inspect real usage patterns:

- Are sessions ending with verification or guesswork?
- Where does friction show up repeatedly?
- How much of the work is backed by passing verification signal?
- Can results be shared publicly without dumping raw transcripts?

`agent-eval` answers those questions with a local-first, transcript-first workflow that favors precision, reproducibility, and public-facing redaction reporting.

## Supported sources

- `codex`: canonical transcripts under `~/.codex/sessions/**/*.jsonl`
- `claude`: canonical transcripts under `~/.claude/projects/**/*.jsonl`

Optional enrichment stores such as history, SQLite, shell snapshots, and session environment files are inventoried when present, but transcript JSONL remains the canonical input.

## Why this is relevant to Applied AI / Solutions Architect work

- It shows analytics design discipline: deterministic metrics, explicit tradeoffs, and reproducible reports.
- It shows governance judgment: transcript previews are redacted and truncated by default, and generated artifacts stay out of git history.
- It shows scalable architecture thinking: source-specific discovery and parsing feed a shared normalized analytics pipeline.
- It shows communication range: the same run produces machine-readable artifacts for engineers and readable reports for broader stakeholders.

## Architecture

```text
source home
  -> discovery inventory
  -> source-specific parser
  -> normalized sessions + turns
  -> labels + incidents + compliance
  -> metrics + summary artifact
  -> markdown/html/svg reports
```

Key design choices:

- Transcript-first: canonical analytics starts from session JSONL, not optional side stores.
- Source-aware adapters: Codex and Claude Code use separate discovery/parsing logic but converge on one normalized session model.
- Deterministic scoring: labeling, clustering, compliance scoring, summaries, and presentation artifacts are all rule-based.
- Redacted-preview defaults: reports use redacted, truncated previews rather than full transcript bodies.

Maintainer boundaries:

- `src/discovery.ts`: provider-specific inventory and transcript discovery
- `src/transcript/*`: provider-specific parsing into the shared normalized session model
- `src/evaluator.ts`: single canonical analytics pipeline
- `src/insights.ts`, `src/report.ts`, `src/presentation.ts`: shared summary, markdown, and presentation outputs
- `src/cli/*`: command wiring, option normalization, and stdout formatting

## CLI

```bash
pnpm inspect -- --source codex --home ~/.codex
pnpm inspect -- --source claude --home ~/.claude
pnpm parse -- --source codex --home ~/.codex --output-dir artifacts
cat artifacts/raw-turns.jsonl
pnpm eval -- --source claude --home ~/.claude --output-dir artifacts
pnpm report -- --source codex --home ~/.codex --output-dir artifacts
pnpm exec tsx src/cli.ts eval --source claude --home ~/.claude --summary-only --session-limit 100
pnpm benchmark
```

Built binary:

```bash
pnpm build
node dist/cli.js inspect --source claude --home ~/.claude
```

Example local config:

```bash
cp .agent-evalrc.example .agent-evalrc
```

Quick local review loop:

```bash
pnpm exec tsx src/cli.ts eval --source claude --home ~/.claude --output-dir artifacts --summary-only
open artifacts/report.html
```

## Outputs

- `parse` writes `artifacts/raw-turns.jsonl` and `artifacts/parse-metrics.json`
- full `eval` and `report` runs write `artifacts/raw-turns.jsonl`, `artifacts/incidents.jsonl`, `artifacts/metrics.json`, `artifacts/summary.json`, `artifacts/report.md`, `artifacts/report.html`, `artifacts/label-counts.svg`, `artifacts/compliance-summary.svg`, and `artifacts/severity-breakdown.svg`
- `eval` and `report` with `--summary-only` skip `raw-turns.jsonl` and `incidents.jsonl` but keep the deterministic summary/report outputs

Every machine-readable output includes `engineVersion` and `schemaVersion`.

Benchmark outputs:

- `artifacts/benchmark/benchmark-results.json`
- `artifacts/benchmark/benchmark-report.md`

## Suggested workflow

```bash
pnpm inspect -- --source claude --home ~/.claude
pnpm eval -- --source claude --home ~/.claude --output-dir artifacts --summary-only
cat artifacts/report.md
jq '.comparativeSlices' artifacts/summary.json
jq '.topSessions' artifacts/summary.json
```

Use `inspect` first to inventory what is available locally. Use `parse` when you want normalized turn reconstruction only; it writes `raw-turns.jsonl` and does not run clustering, scoring, summaries, or report generation. Use `eval` for the full deterministic pipeline. Use `report` when you want the markdown report on stdout while still writing the full evaluation artifact bundle to disk.

`--summary-only` is the recommended mode for large corpora because it skips the heaviest JSONL exports while keeping the same deterministic methodology.

Use `benchmark` to run the synthetic calibration corpus. It validates terminal verification, case-scoped label matching, incident matching, parse-warning handling, and sanitization behavior against deterministic expectations.

## Public repo notes

- Tests use synthetic fixtures only; no private transcript corpora are committed.
- `artifacts/` stays untracked so local evaluations do not leak into git history.
- Report previews are redacted and truncated, but they are not a substitute for full secret scanning.
- If a presentation artifact ever disagrees with the JSON artifacts, treat the JSON artifacts as canonical.

## Project maturity

Current strengths:

- Multi-source discovery and parsing for Codex and Claude Code
- Deterministic summaries, scorecards, badges, and comparative slices
- Strong local test coverage with synthetic fixtures only
- Synthetic benchmark harness covering terminal verification, incidents, parse warnings, and sanitization boundaries

Current limitations:

- Compliance and incident logic is heuristic, not semantic proof of behavior
- Optional enrichment stores are inventoried more deeply than they are merged
- Additional agent providers can be added, but each needs its own adapter and fixture coverage

## Case study

The portfolio-facing writeup lives in `docs/case-study.md` and explains the problem framing, architecture choices, redacted-preview design, and how this transcript analytics engine could support enterprise AI adoption workflows.

## Local verification

```bash
make ci
```

`make ci` is intentionally non-mutating. Use `make bootstrap` for first-time dependency setup and `make fix` when you want formatting rewrites.
