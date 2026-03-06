# agent-eval

`agent-eval` is a local evaluator for Codex session artifacts. It parses canonical transcript JSONL files, labels user-reported failure patterns, clusters those labels into incidents, scores compliance against a small AGENTS-style rule set, and emits blog-ready outputs.

The repository treats deterministic machine-readable artifacts as canonical and generates presentation-friendly outputs as optional derivatives. That split is intentional: you can trust the JSONL and JSON for automation, while the HTML and SVG outputs make results easier to share in a public repo, a blog post, or a quick local review.

## Assumptions

- Canonical input is `~/.codex/sessions/**/*.jsonl`.
- Other local Codex stores are optional enrichment only.
- User-role transcript messages are the primary label source.
- The evaluator prioritizes precision over recall in v1.
- This repository is intended to stay public-safe, so tests and fixtures use synthetic redacted data.

## CLI

```bash
pnpm inspect -- --codex-home ~/.codex
pnpm parse -- --codex-home ~/.codex --output-dir artifacts
pnpm eval -- --codex-home ~/.codex --output-dir artifacts
pnpm report -- --codex-home ~/.codex --output-dir artifacts
pnpm exec tsx src/cli.ts --codex-home ~/.codex --output-dir artifacts --summary-only eval
pnpm exec tsx src/cli.ts --codex-home ~/.codex --output-dir artifacts --session-limit 25 eval
```

The built binary exposes the same commands:

```bash
pnpm build
node dist/cli.js inspect --codex-home ~/.codex
```

For a quick local review loop:

```bash
pnpm exec tsx src/cli.ts --codex-home ~/.codex --output-dir artifacts --session-limit 25 eval
open artifacts/report.html
```

## Outputs

- `artifacts/raw-turns.jsonl`
- `artifacts/incidents.jsonl`
- `artifacts/metrics.json`
- `artifacts/summary.json`
- `artifacts/report.md`
- `artifacts/report.html`
- `artifacts/label-counts.svg`
- `artifacts/compliance-summary.svg`
- `artifacts/severity-breakdown.svg`

Every machine-readable output includes `evaluatorVersion` and `schemaVersion`.
Generated turn and incident artifacts contain redacted, truncated message previews rather than full transcript bodies so the default outputs stay compact and public-safe.
`summary.json` is the best compact handoff artifact for downstream analysis because it includes rates, write-verification coverage, ranked sessions, deterministic opportunities, and top incidents in one place.

## Usage Guide

Use `inspect` first when you want to confirm what the evaluator found locally. It inventories canonical transcript storage and any optional enrichment sources without parsing everything.

Use `parse` when you only want normalized turn reconstruction written to disk. This is useful for sanity-checking transcript coverage before labeling and scoring.

Use `eval` for the full deterministic pipeline. It writes the canonical artifacts plus the derived presentation bundle, which is the default command to use for a public-facing writeup or local review pass.

Use `report` when you want the markdown report on stdout while still writing the same artifacts into the output directory.

Use `--summary-only` when you want a large-corpus run that stays fast and bounded. This mode skips `raw-turns.jsonl` and `incidents.jsonl` emission and focuses on `metrics.json`, `summary.json`, `report.md`, `report.html`, and the SVG charts.
It is the recommended mode for whole-history or multi-thousand-session analysis.

### What The Pretty Outputs Are For

- `summary.json` is the machine-friendly “insight layer” built from canonical artifacts.
- `report.md` is best for PRs, blog drafts, and versioned text snapshots.
- `report.html` is best for local review and sharing a single portable file.
- The SVG charts are meant to be easy to embed into docs or blog posts without needing screenshots.
- The pretty layer now includes friendlier archetype names, show-off stats, a shareable scoreboard, recent momentum cards, comparative slices, victory-lap sessions, and deterministic badges so the results are easier to read outside an engineering context.

### Suggested Workflow

```bash
pnpm inspect -- --codex-home ~/.codex
pnpm eval -- --codex-home ~/.codex --output-dir artifacts
pnpm exec tsx src/cli.ts --codex-home ~/.codex --output-dir artifacts --session-limit 1000 --summary-only eval
pnpm exec tsx src/cli.ts --codex-home ~/.codex --output-dir artifacts --summary-only eval
open artifacts/report.html
cat artifacts/report.md
jq '.labels' artifacts/summary.json
jq '.topSessions' artifacts/summary.json
jq '.victoryLaps, .scoreCards' artifacts/summary.json
jq '.momentumCards, .comparativeSlices' artifacts/summary.json
jq '.bragCards, .achievementBadges' artifacts/summary.json
```

### Session Selection

- When `--session-limit N` is set, the evaluator uses the most recent `N` discovered session transcripts.
- This applies to both full-output runs and `--summary-only` runs.
- Use `inspect` first if you want to understand the size of the local corpus before choosing a limit.

### Public Repo Notes

- Tests use synthetic fixtures only; no private transcript snapshots are checked into the repository.
- Generated previews redact home-directory paths and email addresses, but they are still summaries of real local transcripts.
- `artifacts/` stays untracked so local evaluation output does not accidentally end up in git history.
- The HTML and SVG files are derived outputs. If they ever disagree with the JSON artifacts, treat the JSON artifacts as canonical and regenerate the presentation layer.
- `summary.json` is still deterministic and reproducible. It is an interpretation layer, but not an LLM-generated one.
- `--summary-only` is optimized for scale. It uses the same deterministic methodology, but skips giant JSONL exports so all-history runs stay practical.
- Incident previews now try to prefer human-authored complaint/request text over AGENTS dumps, orchestration wrappers, and other low-signal harness messages.
- Comparative slices summarize the selected corpus plus recent windows like `Recent 100`, `Recent 500`, and `Recent 1000` when enough sessions exist.

## Local Verification

```bash
make ci
```

## Limitations

- Compliance scoring is heuristic and optimized for conservative signal rather than full behavioral proof.
- Verification detection currently focuses on obvious command patterns and high-confidence write tools.
- Optional enrichment sources are inventoried but not deeply merged into canonical parsing yet.
- Some Codex transcript shapes may drift over time; unknown shapes should be treated as schema drift candidates in future revisions.
- Full-history local corpora can be large; use `--session-limit` for bounded exploratory runs while throughput and streaming improve.
- Artifact previews redact home-directory paths and email addresses, but they are not a full secret-scanning system.
- The HTML report is intentionally static and dependency-free; it is meant for portability, not as a replacement for a richer dashboard.
- Session archetypes, friction scores, and opportunities are deterministic heuristics. They are meant to prioritize human attention, not serve as absolute truth.
- Friendly labels like `Recovery Run`, scorecards like `Proof Score`, and badges like `Battle-Tested Corpus` are presentation helpers layered on top of the canonical deterministic metrics.
- Recent momentum cards deliberately prefer a stabler recent window when available, so the headline trend readout is less twitchy than a tiny-slice comparison.
