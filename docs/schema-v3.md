# Schema V3

## Status
- Canonical v3 artifact contract for public `agent-eval` outputs
- Replaces the old operator-first summary contract
- No compatibility layer with the older summary contract

## Canonical outputs

Always emitted by `eval` / `report`:
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

## `summary.json`

Top-level v3 shape:
- `engineVersion`
- `schemaVersion`
- `generatedAt`
- `overview`
- `usageDashboard`
- `exemplarSessions`
- `reviewQueue`
- `attributionSummary`
- `templateSubstrate`
- `learningPatterns`
- `comparativeSlices`

Important rules:
- the schema is strict
- extra stale v2 keys must fail validation
- `reviewQueue` and `exemplarSessions` share the same surfaced-session row shape
- `exemplarSessions` must not be derived from the review queue

## `release-manifest.json`

Each generated bundle also includes a public-safe release manifest with:
- git revision metadata when available
- dirty-worktree state when available
- config fingerprint
- evaluation parameters
- corpus scope and applied filters
- emitted artifact inventory

This complements the canonical analytics artifacts without changing the strict v3 summary/session-facts contract.

## `session-facts.jsonl`

Each row is a public-safe per-session fact record.

Current v3 fields already present include:
- provider
- harness
- model provider / model when transcript-visible
- startedAt / endedAt / duration when transcript-visible
- turn/message/tool counts from canonical session metrics
- write-tool / verification-tool / MCP-tool counts
- top tools
- MCP server summaries
- write/verification/compliance facts
- raw label counts
- surfaced title/evidence/source refs
- surfaced-in flags for review queue / exemplars
- independent exemplar and review selection from the same canonical substrate
- structured `learningPatterns`
- template-band comparative slices

Still intentionally conservative areas include:
- broader learning-pattern coverage beyond the deterministic starter catalog
- richer presentation-layer drilldown beyond the current static card-and-details structure

## Null vs zero semantics

Use `null` when data is unavailable.
Do **not** serialize false zeroes for unavailable optional fields.

Examples:
- unknown token coverage → `null`
- unavailable model → `null`
- unavailable template share → `null`
- no discovered MCP calls in a supported field → `0` only when the field is truly measured and observed as zero

## `metrics.json`

Current `metrics.json` includes first-class aggregate sections for:
- applied filters
- provider / harness / model distributions
- message stats
- tool stats
- MCP stats
- token coverage + token stats
- duration stats
- compaction stats
- UTC temporal buckets
- coverage warnings
- sample warnings

These sections are canonical input to the v3 dashboard.

## Summary-only behavior

`--summary-only` still emits:
- `metrics.json`
- `summary.json`
- `session-facts.jsonl`
- `release-manifest.json`
- `report.md`
- `report.html`
- chart SVGs

It skips:
- `raw-turns.jsonl`
- `incidents.jsonl`

## Removed v2 fields

These are no longer valid top-level summary keys:
- `sessions`
- `turns`
- `incidents`
- `parseWarningCount`
- `labels`
- `severities`
- `compliance`
- `rates`
- `delivery`
- `topSessions`
- `topIncidents`
- `executiveSummary`
- `operatorMetrics`
- `metricGlossary`
- `scoreCards`
- `highlightCards`
- `recognitions`
- `endedVerifiedDeliverySpotlights`
- `opportunities`

## jq migration examples

Old v2:

```bash
jq '.topSessions' artifacts/summary.json
jq '.executiveSummary' artifacts/summary.json
jq '.operatorMetrics' artifacts/summary.json
```

New v3:

```bash
jq '.reviewQueue' artifacts/summary.json
jq '.overview' artifacts/summary.json
jq '.usageDashboard.headlineMetrics' artifacts/summary.json
jq '.appliedFilters' artifacts/metrics.json
jq '.temporalBuckets' artifacts/metrics.json
head -n 5 artifacts/session-facts.jsonl
```
