# agent-eval

`agent-eval` is a deterministic, static, transcript-first agent usage evaluation tool. It discovers local session artifacts, normalizes Codex, Claude Code, and pi transcripts into one shared model, and emits machine-readable artifacts plus static HTML/Markdown reports.

The v3 direction is dashboard-first rather than triage-first. The report is intended to support four lenses:

1. **Overview dashboard**
2. **What worked**
3. **Needs review**
4. **Why this happened**

The project remains local-first, deterministic, static, and public-safe.

## Prerequisites and install

Requirements:

- Node.js 22.16+ (current local validation uses Node 25.x)
- pnpm 10+

This repository is currently GitHub-first and is not published to npm. Use it from a local clone:

```bash
git clone https://github.com/fitchmultz/agent-eval.git
cd agent-eval
pnpm install
```

## Why this project exists

Teams adopting coding agents need a repeatable way to inspect real usage patterns without relying on vague anecdotes or opaque scoring.

`agent-eval` is designed to answer questions like:

- How many sessions happened, and across which providers?
- How often did sessions include code changes?
- How often did write sessions end verified versus unverified?
- What does usage look like quantitatively?
- Which sessions are worth learning from?
- Which sessions need review?
- Can those results be shared without dumping raw transcript bodies?

## Supported sources

- `codex`: canonical transcripts under `~/.codex/sessions/**/*.jsonl`
- `claude`: canonical transcripts under `~/.claude/projects/**/*.jsonl`
- `pi`: canonical transcripts under `~/.pi/agent/sessions/**/*.jsonl`

Optional enrichment stores such as history, SQLite, shell snapshots, and session environment files are inventoried when present, but transcript JSONL remains the canonical input.

## Architecture

```text
source home
  -> discovery inventory
  -> source-specific parser
  -> normalized sessions + turns
  -> labels + incidents + compliance
  -> metrics + summary artifact + session facts
  -> markdown/html/svg reports
```

Key design choices:

- Transcript-first: canonical analytics starts from session JSONL, not optional side stores.
- Source-aware adapters: Codex, Claude Code, and pi use separate discovery/parsing logic but converge on one normalized session model.
- Deterministic scoring: labeling, clustering, compliance scoring, summaries, and presentation artifacts are rule-based.
- Redacted-preview defaults: reports use redacted, truncated previews rather than full transcript bodies.
- Static exportability: HTML, Markdown, JSON, and JSONL outputs remain portable and dependency-free.

## CLI

```bash
pnpm inspect -- --source codex --home ~/.codex
pnpm inspect -- --source claude --home ~/.claude
pnpm inspect -- --source pi --home ~/.pi
pnpm parse -- --source codex --home ~/.codex --output-dir artifacts
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
# Then open artifacts/report.html in your browser.
```

## Outputs

Canonical outputs:

- `metrics.json`
- `summary.json`
- `session-facts.jsonl`
- `release-manifest.json`

Optional heavier outputs:

- `raw-turns.jsonl`
- `incidents.jsonl`

Presentation outputs:

- `report.md`
- `report.html`
- `sessions-over-time.svg`
- `provider-share.svg`
- `harness-share.svg`
- `tool-family-share.svg`
- `attribution-mix.svg`

`parse` writes:

- `raw-turns.jsonl`
- `parse-metrics.json`

Every machine-readable output includes `engineVersion` and `schemaVersion`. `release-manifest.json` also records release provenance such as the current git revision when available, dirty-worktree state, a config fingerprint, evaluation parameters, and emitted artifact inventory.

The current public artifact contract is `schemaVersion: "3"`.

## How to read the v3 report

Read the report from top to bottom in this order:

1. **Overview Dashboard** — broad corpus metrics and diagnostic context.
2. **What Worked** — exemplar sessions and positive learning surfaces.
3. **Needs Review** — ranked sessions that merit deeper inspection.
4. **Why This Happened** — attribution and template-substrate context.
5. **Comparative Slices** — static slice comparisons.
6. **Methodology And Limitations** — deterministic caveats.
7. **Inventory** — discovered local inputs.

The current release includes corpus-regression gates, provider-parity checks, session-facts behavioral tests, and a canonical-evaluator calibration benchmark to protect the dashboard + learning + review + attribution contract across Codex, Claude, and pi.

`--summary-only` remains the preferred mode for large corpora. It skips heavy raw JSONL artifacts while preserving the canonical `metrics.json`, `summary.json`, `session-facts.jsonl`, and the static HTML/Markdown reports.

## Suggested workflow

```bash
pnpm inspect -- --source pi --home ~/.pi
pnpm eval -- --source pi --home ~/.pi --output-dir artifacts --summary-only
pnpm eval -- --source pi --home ~/.pi --output-dir artifacts --summary-only --start-date 2026-03-01 --end-date 2026-03-31 --time-bucket day
cat artifacts/report.md
jq '.usageDashboard.headlineMetrics' artifacts/summary.json
jq '.appliedFilters' artifacts/metrics.json
jq '.temporalBuckets' artifacts/metrics.json
head -n 5 artifacts/session-facts.jsonl
```

Use `inspect` first to inventory what is available locally. Use `parse` when you want normalized turn reconstruction only; it writes `raw-turns.jsonl` and does not run clustering, scoring, summaries, or report generation. Use `eval` for the full deterministic pipeline. Use `report` when you want the markdown report on stdout while still writing the full evaluation artifact bundle to disk.

Use `benchmark` to run the synthetic calibration corpus. It now validates the canonical evaluator path end-to-end, including terminal verification, case-scoped label matching, incident matching, attribution expectations, surfaced-session expectations, parse-warning handling, and sanitization behavior.

Use `pnpm smoke:dist` after `pnpm build` when you want a packaged-CLI smoke test that verifies bundled runtime assets, benchmark execution, and styled HTML emission from `dist/cli.js`.

Use `pnpm scan:artifacts <path...>` when you want a local public-surface leak scan across generated `.json`, `.jsonl`, `.md`, `.html`, and `.svg` artifacts.

## Public repo hygiene

- Tests use synthetic fixtures only; no private transcript corpora are committed.
- Local evaluation outputs, local agent homes, and temporary analysis material stay untracked.
- Visual QA screenshots should stay local and untracked under `notes/**/verification/`; regenerate the latest captures locally and attach them to review/oracle archives instead of committing PNG history.
- Report previews are redacted and truncated, but they are not a substitute for full secret scanning.
- If a presentation artifact ever disagrees with the JSON artifacts, treat the JSON artifacts as canonical.

## Scope and limitations

In scope today:

- Multi-source discovery and parsing for Codex, Claude Code, and pi
- Deterministic local analytics from transcript JSONL
- Static HTML/Markdown report generation
- Canonical machine-readable artifacts for dashboard, review, and session facts
- Strong local test coverage with synthetic fixtures only

Not in scope yet:

- Semantic proof that repository state is correct
- Deep optional-store joins beyond transcript-first enrichment
- Richer learning-pattern breadth and deeper exemplar semantics beyond the current deterministic starter catalog
- Additional corpus breadth and public-surface hardening beyond the current regression and calibration gate set

## Documentation

- `docs/schema-v3.md` — canonical artifact contract
- `docs/report-v3.md` — report/product model
- `docs/case-study.md` — architecture and design context

## Local verification

```bash
make ci
# or, explicitly:
pnpm lint && pnpm typecheck && pnpm test && pnpm benchmark && pnpm scan:artifacts artifacts/benchmark && pnpm build && pnpm smoke:dist
```

`make ci` is the baseline local gate. It is not formatting-mutating, but it does generate benchmark and dist smoke artifacts as part of validation. Use `make bootstrap` for first-time dependency setup and `make fix` when you want formatting rewrites.

## Release signoff

If you are doing a final public-release pass, use this sequence:

```bash
# 1. Regenerate the provider QA bundles.
# 2. Review them and commit the refreshed artifacts.
# 3. From the clean committed tree, run:
make release-check
# equivalent to:
pnpm check:release
```

`make release-check` extends the baseline gate by:
- requiring a clean git worktree before validation starts
- requiring branch `main`
- requiring local `HEAD` to match its upstream exactly
- verifying that the committed final QA manifests were generated from the current clean `HEAD`
- rerunning the clean/main/upstream check after the validation commands finish so release validation does not leave tracked drift behind
- scanning the benchmark bundle and the regenerated final QA artifacts:
  - `artifacts/final-qa-codex`
  - `artifacts/final-qa-claude`
  - `artifacts/final-qa-pi`

Visual QA screenshots are intentionally outside the committed release contract. Regenerate them locally under `notes/final-release/verification/` when needed for manual review or oracle archives, but do not commit them.
