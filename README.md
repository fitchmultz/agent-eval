# agent-eval

`agent-eval` is a local evaluator for Codex session artifacts. It parses canonical transcript JSONL files, labels user-reported failure patterns, clusters those labels into incidents, scores compliance against a small AGENTS-style rule set, and emits blog-ready outputs.

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

## Outputs

- `artifacts/raw-turns.jsonl`
- `artifacts/incidents.jsonl`
- `artifacts/metrics.json`
- `artifacts/report.md`

Every machine-readable output includes `evaluatorVersion` and `schemaVersion`.
Generated turn and incident artifacts contain redacted, truncated message previews rather than full transcript bodies so the default outputs stay compact and public-safe.

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
