# Proposed Schema

This document now reflects the schema the repo actually implements for v1, plus a small list of explicitly deferred ideas.

## Implemented V1 Model

The analytics engine currently normalizes supported developer-agent transcript artifacts into three primary output records plus one derived summary layer:

- `RawTurnRecord`
  - one normalized turn-level record per reconstructed transcript turn
  - includes session/turn identity, message preview counts, tool-call summaries, labels, and source refs
- `IncidentRecord`
  - one clustered incident per same-session label episode
  - includes summary, severity, confidence, evidence previews, and source refs
- `MetricsRecord`
  - one corpus/session aggregate record
  - includes label counts, compliance rollups, per-session metrics, and discovered inventory
- `SummaryArtifact`
  - a deterministic derived summary for reporting and sharing
  - includes counts, rates, delivery coverage, comparative slices, score cards, highlight cards, recognitions, opportunities, top sessions, ended-verified spotlights, and top incidents

## Why This Is The Actual V1 Shape

- It is transcript-first and portable.
- It keeps the canonical persisted model small enough to audit.
- It avoids over-normalizing details that are not yet needed for deterministic scoring.
- It gives the report/presentation layer enough typed structure without requiring an LLM.

## Deliberately Deferred Concepts

The earlier exploration notes described a richer long-term normalized model. These concepts are explicitly deferred, not partially implemented:

- `EvalCorpus`
- `EvalSession`
- `EvalTurn`
- `EvalMessage`
- `ToolInvocation` with parsed argument payloads and effect arrays
- `ReasoningRecord`
- `AuxiliaryEvent`
- `TurnOutcome`
- `VerificationSummary`
- `VerificationCommand`

Why deferred:

- they add substantial parsing and maintenance complexity
- the current deterministic analytics engine does not need them to score the supported behaviors
- optional local enrichment stores are not yet merged deeply enough to justify those abstractions

## Current Schema Boundary

Treat these as canonical persisted outputs for v1:

- `raw-turns.jsonl`
- `incidents.jsonl`
- `metrics.json`
- `summary.json`

Treat these as presentation derivatives:

- `report.md`
- `report.html`
- `label-counts.svg`
- `compliance-summary.svg`
- `severity-breakdown.svg`

## Future Expansion Rule

Only add a richer normalized entity when at least one of these is true:

1. A deterministic metric or rule cannot be expressed cleanly with the current model.
2. A discovered optional enrichment source is stable enough to justify first-class normalization.
3. The additional shape reduces total code complexity instead of just moving it around.
