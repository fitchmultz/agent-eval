# Report V3

## Product shape

The v3 report is a deterministic, static, transcript-first agent usage evaluation surface.

It is organized around four first-class lenses:
1. **Overview dashboard**
2. **What worked**
3. **Needs review**
4. **Why this happened**

Triage remains important, but it is not the whole product.

## Section order

1. Header
2. Overview Dashboard
3. What Worked
4. Needs Review
5. Why This Happened
6. Comparative Slices
7. Methodology And Limitations
8. Inventory

## Section meanings

### Overview Dashboard
Broad quantitative understanding of the selected corpus.

### What Worked
Positive exemplars and learning surfaces.

### Needs Review
Sessions that merit deeper inspection.

### Why This Happened
Attribution and template-substrate context.

### Comparative Slices
Static precomputed comparisons rather than client-side filtering.

## Current caveat

The current report surface is intentionally static and conservative:
- HTML and markdown read from one shared display model rather than reshaping the summary independently
- the dashboard uses the time/provider/harness/tool-family/attribution chart set
- exemplar and review surfaces render as distinct card variants while staying balanced in the overall IA
- corpus-regression gates and the calibration benchmark validate canonical evaluator behavior, surfaced-session flags, attribution expectations, and scaffold-heavy corpus handling

What remains intentionally conservative:
- charting stays simple rather than turning into a dense mini-BI system
- static drilldown remains card-and-details based rather than interactive filtering
- attribution and learning patterns remain deterministic and transcript-visible rather than model-inferred

This remains intentional. The report prefers explicit coverage gaps, conservative attribution, and static portability over false precision or premature UI complexity.

## Relationship between artifacts

- `metrics.json` — corpus/session aggregate record
- `summary.json` — curated report surface used by markdown/html outputs
- `session-facts.jsonl` — public-safe per-session fact rows for audit/drilldown
- `release-manifest.json` — release provenance for the generated bundle (git revision and dirty-worktree state when available, config fingerprint, evaluation parameters, and emitted artifact inventory)

The HTML and Markdown reports are deterministic derivatives of those artifacts.
