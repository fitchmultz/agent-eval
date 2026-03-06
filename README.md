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

## Usage Guide

Use `inspect` first when you want to confirm what the evaluator found locally. It inventories canonical transcript storage and any optional enrichment sources without parsing everything.

Use `parse` when you only want normalized turn reconstruction written to disk. This is useful for sanity-checking transcript coverage before labeling and scoring.

Use `eval` for the full deterministic pipeline. It writes the canonical artifacts plus the derived presentation bundle, which is the default command to use for a public-facing writeup or local review pass.

Use `report` when you want the markdown report on stdout while still writing the same artifacts into the output directory.

### Suggested Workflow

```bash
pnpm inspect -- --codex-home ~/.codex
pnpm eval -- --codex-home ~/.codex --output-dir artifacts
open artifacts/report.html
cat artifacts/report.md
jq '.labels' artifacts/summary.json
```

### Public Repo Notes

- Tests use synthetic fixtures only; no private transcript snapshots are checked into the repository.
- Generated previews redact home-directory paths and email addresses, but they are still summaries of real local transcripts.
- `artifacts/` stays untracked so local evaluation output does not accidentally end up in git history.
- The HTML and SVG files are derived outputs. If they ever disagree with the JSON artifacts, treat the JSON artifacts as canonical and regenerate the presentation layer.

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
