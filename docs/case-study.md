# Case Study: Transcript-First Analytics For Developer AI Agents

## Executive summary

`agent-eval` is a local, deterministic transcript analytics engine for developer-agent transcripts. It uses a source-aware architecture so the same analytics engine can ingest Claude Code, Codex, and pi transcripts through provider-specific adapters and a shared normalized model.

That decision matters because most teams adopting coding agents do not need another demo. They need a repeatable way to understand how work is actually happening: where friction clusters, how often changes are verified, whether delivery discipline is improving, and how to share results without exposing raw session data.

## Problem framing

Developer-agent adoption creates a familiar measurement problem:

- transcript data is real and useful, but often noisy
- provider-specific storage formats fragment analytics work
- dashboards can become hand-wavy if they are detached from canonical artifacts
- public-facing analytics projects often overfit to visuals instead of methodology

I wanted a system that stayed grounded in auditable artifacts and still produced outputs that a hiring panel, engineering lead, or AI program owner could skim quickly.

## Design goals

- Keep transcript JSONL as the canonical input.
- Favor deterministic methods over model-graded interpretation for the core pipeline.
- Normalize multiple providers into one downstream session model.
- Keep the public artifact layer safe enough for an open GitHub repo.
- Produce outputs useful to both engineers and non-engineering reviewers.

## Architecture decisions

### 1. Source-aware adapters, shared analytics core

Discovery and parsing are provider-specific because Codex, Claude Code, and pi store data differently. Everything after normalization is shared:

- parsed sessions
- normalized turns
- labels
- incidents
- compliance scoring
- summary/report generation

This makes the system easier to extend without forking the downstream analytics logic for every provider.

### 2. Transcript-first over enrichment-first

The analytics engine inventories optional stores such as history files, SQLite databases, shell snapshots, and Claude session environment files, but the canonical methodology still starts from transcript JSONL. That keeps the system stable even when optional stores drift.

### 3. Deterministic presentation, not just deterministic metrics

The project does not stop at deterministic raw metrics. It also keeps the presentation layer deterministic.

The presentation layer emphasizes an operator-first static triage surface:

- executive summary framing
- session-first review queue
- deterministic `whySelected` reasons
- evidence previews and source references
- trust flags and metric glossary support

That makes the output more useful for operational review while preserving reproducibility and static exportability.

## Claude Code and pi support

Claude Code and pi both follow the same adapter-first pattern: provider-specific discovery and parsing, followed by the same shared downstream analytics model.

The implementation work included:

- discovering Claude transcripts under `~/.claude/projects/**/*.jsonl`
- inventorying Claude-specific optional stores like `history.jsonl`, `shell-snapshots`, and `session-env`
- parsing Claude JSONL records into the same normalized session/turn/tool-call model used elsewhere
- discovering pi session transcripts under `~/.pi/agent/sessions/**/*.jsonl`
- resolving pi's persisted current branch path before normalization so abandoned branches do not pollute analysis
- preserving provider metadata in normalized records so mixed corpora stay interpretable

I targeted discovery and parsing parity first rather than inventing provider-specific scoring rules prematurely. That keeps the analytics engine honest, comparable, and maintainable.

## Privacy and redacted-preview design

Because this repo is public, the project defaults matter:

- generated artifacts are not committed
- message previews are redacted and truncated
- tests use synthetic fixtures only
- the canonical artifacts stay compact enough for inspection without exposing full transcript bodies

This is the kind of tradeoff I would also make in customer-facing AI adoption work: preserve utility, but do not casually expand the data surface.

## What this demonstrates

For engineers:

- strict typed refactoring across a non-trivial blast radius
- adapter-based architecture with shared downstream contracts
- deterministic transcript analytics methodology with test coverage

For decision-makers:

- clear separation between canonical evidence and presentation outputs
- practical governance instincts around sensitive session data
- a static report that is still useful for operator triage, not just executive narration
- a way to compare developer-agent usage patterns without relying on vague anecdotes

## How this could support enterprise AI adoption

In a production or customer environment, I would extend this in a few directions:

- comparative rollouts across teams, tools, or time windows
- governance reports tailored for engineering leadership and AI platform owners
- richer policy proxy packs for verification behavior, risky write patterns, and workflow hygiene
- source adapters for additional agent products while preserving the shared analytics core

The important part is that the architecture already supports that direction without needing to be rebuilt.

## Future extensions

- Deepen optional enrichment joins where they improve confidence without undermining the transcript-first core.
- Expand calibration and benchmark coverage before adding more provider adapters.
- Add run-over-run comparison and recurring cross-session pattern views on top of the operator-first report contract.
- Split the surface more explicitly into operator and shareable/public skins once the operator queue is trusted.
- Expand fixture coverage as source formats evolve.
