# Case Study: Transcript-First Analytics For Developer AI Agents

> **Status note:** This document describes the project architecture and design rationale. The current public report model is the v3 dashboard + learning + review surface described in `docs/report-v3.md` and `docs/schema-v3.md`.

## Executive summary

`agent-eval` is a local, deterministic transcript analytics engine for developer-agent transcripts. It uses a source-aware architecture so the same analytics engine can ingest Claude Code, Codex, and pi transcripts through provider-specific adapters and a shared normalized model.

That decision matters because most teams adopting coding agents do not need another demo. They need a repeatable way to understand how work is actually happening, what is working well, where friction clusters, how often changes are verified, and how to share results without exposing raw session data.

## Problem framing

Developer-agent adoption creates a familiar measurement problem:

- transcript data is real and useful, but often noisy
- provider-specific storage formats fragment analytics work
- dashboards can become hand-wavy if they are detached from canonical artifacts
- public-facing analytics projects often overfit to visuals instead of methodology

The goal is a system that stays grounded in auditable artifacts and still produces outputs that an evaluator, engineering lead, or AI program owner can skim quickly.

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
- metrics / summary / session-fact generation
- report generation

This makes the system easier to extend without forking downstream analytics logic for every provider.

### 2. Transcript-first over enrichment-first

The analytics engine inventories optional stores such as history files, SQLite databases, shell snapshots, and Claude session environment files, but the canonical methodology still starts from transcript JSONL. That keeps the system stable even when optional stores drift.

### 3. Deterministic public artifacts

The project does not stop at deterministic raw metrics. It also keeps the public artifact layer deterministic:

- `metrics.json`
- `summary.json`
- `session-facts.jsonl`
- static markdown/html/svg derivatives

That makes the output easier to review, share, and audit without turning the analytics engine into an opaque black box.

## Privacy and redacted-preview design

Because this repo is public, the project defaults matter:

- generated artifacts are not committed
- message previews are redacted and truncated
- tests use synthetic fixtures only
- the canonical artifacts stay compact enough for inspection without exposing full transcript bodies

This preserves utility without casually expanding the data surface.

## What this demonstrates

For engineers:

- strict typed refactoring across a non-trivial blast radius
- adapter-based architecture with shared downstream contracts
- deterministic transcript analytics methodology with test coverage

For decision-makers:

- clear separation between canonical evidence and presentation outputs
- practical governance instincts around sensitive session data
- a static report that can evolve across dashboard, learning, and review use cases
- a way to compare developer-agent usage patterns without relying on vague anecdotes

## Future extensions

- deepen optional enrichment joins where they improve confidence without undermining the transcript-first core
- expand calibration and benchmark coverage before adding more provider adapters
- broaden fixture coverage as source formats evolve
- keep improving learning-pattern breadth and review-surface diversity without giving up deterministic methodology
