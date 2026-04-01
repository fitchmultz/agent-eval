# agent-eval

`agent-eval` is a transcript-first analytics engine for developer AI agents. It discovers local session artifacts, normalizes Codex, Claude Code, and pi transcripts into one shared model, applies deterministic labeling and compliance heuristics, and emits machine-readable artifacts plus static reports.

The project is intentionally built for methodological clarity rather than dashboard theater. JSON and JSONL outputs are canonical. Markdown, HTML, and SVG outputs are deterministic derivatives that make the results easier to review, share, and audit without turning the analytics engine into an opaque black box.

The report surface is operator-first: the top of each report explains the primary delivery risk, recent directional context, and which sessions should be reviewed first. The report remains fully static and exportable, including in `--summary-only` mode.

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
- `pi`: canonical transcripts under `~/.pi/agent/sessions/**/*.jsonl`

Optional enrichment stores such as history, SQLite, shell snapshots, and session environment files are inventoried when present, but transcript JSONL remains the canonical input.

## What this repository demonstrates

- Deterministic analytics design: explicit tradeoffs, reproducible outputs, and stable summary contracts.
- Governance judgment: transcript previews are redacted and truncated by default, and local artifacts stay out of git history.
- Extensible architecture: source-specific discovery and parsing feed a shared normalized analytics pipeline.
- Communication range: the same run produces machine-readable artifacts for engineers and readable reports for broader stakeholders.

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
- Source-aware adapters: Codex, Claude Code, and pi use separate discovery/parsing logic but converge on one normalized session model.
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
pnpm inspect -- --source pi --home ~/.pi
pnpm parse -- --source codex --home ~/.codex --output-dir artifacts
cat artifacts/raw-turns.jsonl
pnpm eval -- --source claude --home ~/.claude --output-dir artifacts
pnpm report -- --source codex --home ~/.codex --output-dir artifacts
pnpm exec tsx src/cli.ts eval --source pi --home ~/.pi --summary-only --session-limit 100
pnpm benchmark
```

Built binary:

```bash
pnpm build
node dist/cli.js inspect --source pi --home ~/.pi
```

Example local config:

```bash
cp .agent-evalrc.example .agent-evalrc
```

Quick local review loop:

```bash
pnpm exec tsx src/cli.ts eval --source pi --home ~/.pi --output-dir artifacts --summary-only
open artifacts/report.html
```

## Outputs

- `parse` writes `artifacts/raw-turns.jsonl` and `artifacts/parse-metrics.json`
- full `eval` and `report` runs write `artifacts/raw-turns.jsonl`, `artifacts/incidents.jsonl`, `artifacts/metrics.json`, `artifacts/summary.json`, `artifacts/report.md`, `artifacts/report.html`, `artifacts/label-counts.svg`, `artifacts/compliance-summary.svg`, and `artifacts/severity-breakdown.svg`
- `eval` and `report` with `--summary-only` skip `raw-turns.jsonl` and `incidents.jsonl` but keep the deterministic summary/report outputs

Every machine-readable output includes `engineVersion` and `schemaVersion`.

The redesigned operator report and enriched summary artifact are emitted under `schemaVersion: "2"`. That cutover reflects the new triage-first summary contract: required executive summary text, operator metrics, metric glossary entries, humane session identity, deterministic `whySelected` reasons, evidence previews, source references, and trust flags.

Benchmark outputs:

- `artifacts/benchmark/benchmark-results.json`
- `artifacts/benchmark/benchmark-report.md`

## How to read the operator report

Read the report from top to bottom in this order:

1. **Executive Summary** — quick operator framing: what looks wrong, what changed, and what to do next.
2. **Sessions To Review First** — the primary triage queue. Each card is a session-first review target with humane identity, deterministic `whySelected` reasons, evidence previews, source references, and trust flags.
3. **Compliance Breakdown** — rule-level failure concentration across the corpus.
4. **Metric Glossary** — plain-language explanation for operator-facing proxy metrics.
5. **Recurring Patterns And Incidents** — cross-session support view, not the primary review object.
6. **Report Metadata** — source, scope, and comparability details.

`--summary-only` is still the preferred mode for large corpora. It skips heavy raw JSONL artifacts while preserving the operator queue, executive summary, glossary, and static HTML/markdown reports.

## Suggested workflow

```bash
pnpm inspect -- --source pi --home ~/.pi
pnpm eval -- --source pi --home ~/.pi --output-dir artifacts --summary-only
cat artifacts/report.md
jq '.comparativeSlices' artifacts/summary.json
jq '.topSessions' artifacts/summary.json
```

Use `inspect` first to inventory what is available locally. Use `parse` when you want normalized turn reconstruction only; it writes `raw-turns.jsonl` and does not run clustering, scoring, summaries, or report generation. Use `eval` for the full deterministic pipeline. Use `report` when you want the markdown report on stdout while still writing the full evaluation artifact bundle to disk.

`--summary-only` is the recommended mode for large corpora because it skips the heaviest JSONL exports while keeping the same deterministic methodology.

Use `benchmark` to run the synthetic calibration corpus. It validates terminal verification, case-scoped label matching, incident matching, parse-warning handling, and sanitization behavior against deterministic expectations.

## Public repo hygiene

- Tests use synthetic fixtures only; no private transcript corpora are committed.
- Local evaluation outputs, local agent homes, and temporary analysis material stay untracked.
- Report previews are redacted and truncated, but they are not a substitute for full secret scanning.
- If a presentation artifact ever disagrees with the JSON artifacts, treat the JSON artifacts as canonical.

## Scope and limitations

In scope today:

- Multi-source discovery and parsing for Codex, Claude Code, and pi
- Operator-first static triage report with a session-first review queue
- Deterministic summaries, glossary-backed proxy metrics, and recurring-pattern support views
- Strong local test coverage with synthetic fixtures only
- Synthetic benchmark coverage for terminal verification, incidents, parse warnings, and sanitization boundaries

Not in scope yet:

- Semantic proof that repository state is correct
- Deep optional-store joins beyond transcript-first enrichment
- Comparative run-over-run views and public/shareable presentation skins beyond the current operator-first surface

## Case study

`docs/case-study.md` provides a concise walkthrough of the problem framing, architecture choices, privacy defaults, and report design decisions behind the project.

## Local verification

```bash
make ci
```

`make ci` is intentionally non-mutating. Use `make bootstrap` for first-time dependency setup and `make fix` when you want formatting rewrites.
