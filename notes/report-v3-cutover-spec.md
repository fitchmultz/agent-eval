# Report V3 Cutover Spec

## Status
- Canonical redesign spec
- Replaces prior operator-first / pi-report redesign planning
- Full cutover; no backwards compatibility mode

## Decision summary
The product is no longer an operator-triage-first report with metrics attached.

The target product is a **deterministic, static, transcript-first agent usage evaluation tool** with four first-class lenses:
1. **Overview dashboard**
2. **What worked**
3. **Needs review**
4. **Why this happened**

Triage remains important, but it is only one lens.

## Product goal
Help a human understand agent usage across providers by showing:
- what happened quantitatively
- what worked well
- what did not work well
- whether issues were likely caused by:
  - user prompting / scope definition
  - agent behavior
  - repeated prompt-template scaffolding
  - mixed / unclear causes
- what to copy, what to avoid, and what to inspect next

## Current mismatch to correct
The current app is structurally optimized for:
- operator-first review
- unverified delivery detection
- session risk ranking
- incident / compliance triage

That is too narrow for the intended product.

Current weaknesses to eliminate:
- report center of gravity is too negative
- repeated prompt-template text pollutes titles, evidence, labels, incidents, and rankings
- positive exemplars are not first-class
- user-skill vs agent-behavior attribution is missing
- dashboard breadth is too thin
- existing chart outputs are underused

## Non-negotiables
- Keep transcript JSONL as canonical input
- Keep outputs deterministic
- Keep HTML/Markdown static and exportable
- Keep public-safe artifacts sanitized
- Keep summary-only mode useful
- Full cutover; do not preserve the v2 operator-first contract
- Prefer simple code and clear ownership

## Product principles
- **Dashboard first**: the report should open with a broad quantitative view
- **Learning plus triage**: positive and negative examples must both be surfaced
- **De-template upstream**: repeated scaffolding must be handled before ranking and evidence selection
- **Attribution with humility**: user-scope vs agent-behavior calls must be deterministic, confidence-tagged, and allowed to be mixed/unknown
- **Raw counts over proxy theater**: lead with direct metrics and rates; keep proxy scores secondary
- **Static, not simplistic**: no SPA required, but the report must still support drilldown via good structure

## Full cutover decisions
- Bump schema to v3
- Introduce `session-facts.jsonl` as a public-safe per-session artifact
- Replace operator-first summary contract with a multi-lens summary contract
- Replace `topSessions` as the product center with separate surfaces for:
  - `exemplarSessions`
  - `reviewQueue`
- Do not derive positive exemplars from the risk queue
- Do not attempt another regex-only cleanup pass as the main solution

## Target artifact contract

### Canonical outputs
- `metrics.json`
- `summary.json`
- `session-facts.jsonl`

### Optional heavier outputs
- `raw-turns.jsonl`
- `incidents.jsonl`

### Presentation outputs
- `report.html`
- `report.md`
- charts / SVG derivatives

## Target v3 data additions

### Per-session facts
Each session fact should be public-safe and include, where available:
- provider
- harness
- model provider / model
- startedAt / endedAt / duration
- turn count
- user message count
- assistant message count
- tool call count
- write-tool call count
- verification-tool call count
- MCP tool call count
- top tools
- MCP server summary
- write / verification counts
- ended verified status
- compliance score + failed rules
- raw vs de-templated label counts
- template artifact score / text share / flags
- attribution primary / confidence / reasons
- task-specific title
- sanitized evidence previews
- source refs

### Aggregate metrics
Add first-class sections for:
- provider distribution
- harness distribution
- model distribution with coverage warnings
- message stats
- tool stats
- MCP stats
- token stats with explicit coverage
- duration stats
- temporal buckets
- attribution summary
- template substrate summary
- applied filters
- coverage/sample warnings

## Target report information architecture

### 1. Header
Show:
- report title
- corpus context
- applied filters
- coverage / sample warnings
- metadata collapsed by default

### 2. Overview dashboard
Lead with broad quantitative understanding.

Required content:
- sessions
- write sessions
- ended verified
- ended unverified
- avg user messages / session
- avg assistant messages / session
- avg tool calls / session
- MCP session share
- interrupt rate
- compaction rate if available
- token coverage and token stats if available

Required visuals:
- sessions over time
- provider / harness share
- tool-family share
- attribution mix

### 3. What worked
First-class positive learning surface.

Required content:
- exemplar session cards
- successful prompting / scoping patterns
- successful execution patterns
- concise “what to copy” explanations

### 4. Needs review
Keep triage, but narrow it to truly review-worthy sessions.

Required content:
- de-templated review queue
- likely cause / attribution
- strong evidence preview
- reason tags
- diversity guard so duplicate template signatures do not dominate

### 5. Why this happened
Explain the corpus, not just the incidents.

Required content:
- attribution breakdown
- template substrate summary
- recurring user-skill patterns
- recurring agent-behavior patterns
- recurring mixed / ambiguous patterns

### 6. Comparative slices
Precompute static slices for:
- selected corpus
- last 7 / 30 / 90 days
- provider
- harness
- write sessions vs analysis-only
- high-template vs low-template

### 7. Methodology, limitations, inventory
Keep these explicit, but lower in the page and visually de-emphasized.

## Attribution model
Every surfaced session should carry:
- primary attribution
- confidence
- 2–3 reason tags

Allowed attribution values:
- `user_scope`
- `agent_behavior`
- `template_artifact`
- `mixed`
- `unknown`

Rules:
- never assign user fault just because a session failed
- never assign agent fault without transcript-visible evidence
- allow `mixed` and `unknown` freely
- expose confidence and reasons in both JSON and reports

## Template-heavy corpus handling
Template/scaffold handling moves upstream.

Introduce a corpus-level `TemplateRegistry` that:
- splits messages into segments
- normalizes repeated scaffold text
- tracks document frequency by session
- marks likely template/runbook/boilerplate families

Template-marked segments must be excluded by default from:
- title derivation
- evidence selection
- label matching
- recurring-pattern clustering
- review ranking reasons
- exemplar ranking reasons

The report must still disclose template substrate explicitly:
- share of sessions affected
- estimated template text share
- top scaffold families
- learning-surface caveat for scaffold-heavy corpora

## Implementation phases

## Phase 0 — Schema v3 contract and cutover
Purpose:
- establish the new product contract before UI work

Primary changes:
- bump schema version to `3`
- add `session-facts.jsonl`
- replace operator-first summary contract with multi-lens summary contract
- document the new artifacts and report model

Target files:
- `src/version.ts`
- `src/schema.ts`
- `src/artifact-writer.ts`
- `src/insights.ts`
- `README.md`
- `docs/schema-v3.md` (new)
- `docs/report-v3.md` (new)

Exit criteria:
- schema v3 is canonical
- summary/artifact writing validates against v3
- no v2-specific summary assumptions remain in writer boundaries

## Phase 1 — Session facts and dashboard metrics
Purpose:
- add the missing quantitative substrate

Primary changes:
- expand normalized session/session-metric fields
- normalize tool families and MCP tools
- add message/tool/MCP/time aggregates
- add CLI date filtering and bucket selection
- add coverage flags for unavailable model/token/compaction data

Target files:
- `src/transcript/types.ts`
- `src/transcript/parser.ts`
- `src/transcript/session-builder.ts`
- `src/transcript/claude-parser.ts`
- `src/transcript/pi-parser.ts`
- `src/session-processor.ts`
- `src/metrics-aggregation.ts`
- `src/evaluator.ts`
- `src/tool-classification.ts`
- `src/tool-normalization.ts` (new)
- `src/transcript/session-order.ts`
- `src/cli/options.ts`
- `src/cli/main.ts`
- `src/report-scope.ts`

Exit criteria:
- `metrics.json` includes dashboard-grade aggregate sections
- `session-facts.jsonl` emits sanitized per-session facts
- static time-window filtering works via CLI

## Phase 2 — Corpus-level de-templating and attribution
Purpose:
- stop prompt-template scaffolding from defining the product surface

Primary changes:
- add `TemplateRegistry`
- compute raw vs de-templated signal counts
- assign deterministic attribution with confidence + reason tags
- move template handling ahead of labels/ranking/titles/incidents

Target files:
- `src/template-analysis.ts` (new)
- `src/attribution.ts` (new)
- `src/sanitization.ts`
- `src/labels.ts`
- `src/summary/session-display.ts`
- `src/incident-selection.ts`
- `src/session-ranking.ts`
- `src/evaluator.ts`

Exit criteria:
- repeated scaffold titles no longer dominate surfaced rows
- template-heavy corpora produce template-substrate disclosure
- surfaced sessions have attribution + confidence + reasons

## Phase 3 — Summary core and ranked surfaces
Purpose:
- make the summary model match the intended product

Primary changes:
- replace triage-centered summary core
- add distinct overview / exemplar / review / attribution / learning sections
- separate positive exemplar ranking from review ranking
- expand comparative slices to reflect the new product questions

Target files:
- `src/summary-core.ts`
- `src/summary-decorations.ts`
- `src/comparative-slices.ts`
- `src/session-ranking.ts`
- `src/report.ts`
- `src/summary/types.ts`
- `src/summary/aggregation.ts`

Exit criteria:
- summary output includes:
  - `overview`
  - `usageDashboard`
  - `exemplarSessions`
  - `reviewQueue`
  - `attributionSummary`
  - `templateSubstrate`
  - `learningPatterns`
  - `comparativeSlices`
- positive exemplars are selected independently from the review queue

## Phase 4 — Static report IA and presentation rebuild
Purpose:
- make the HTML/Markdown reports reflect the new product shape

Primary changes:
- make dashboard the first visible section
- render existing and new charts
- add exemplar cards
- add attribution badges / reason tags
- demote methodology/inventory
- keep static drilldown via card structure, anchors, and `<details>`

Target files:
- `src/html-report/render.ts`
- `src/html-report/cards.ts`
- `src/html-report/tables.ts`
- `src/presentation.ts`
- `src/report.ts`
- `src/styles/report.css`
- `src/svg-charts.ts`

Exit criteria:
- report opens with dashboard, not triage
- “What worked” is visible and useful
- “Needs review” is still present but not dominant
- charts are meaningfully embedded

## Phase 5 — Regression, calibration, and corpus gates
Purpose:
- keep the new product honest over time

Primary changes:
- add template-analysis tests
- add attribution tests
- add session-facts tests
- add corpus-level regression checks
- extend calibration fixtures for user-scope, agent-behavior, mixed, exemplar, and scaffold-heavy cases

Target files:
- `tests/template-analysis.test.ts` (new)
- `tests/attribution.test.ts` (new)
- `tests/session-facts.test.ts` (new)
- `tests/corpus-regression.test.ts` (new)
- `tests/transcript.test.ts`
- `tests/transcript-handlers.test.ts`
- `tests/session-ranking.test.ts`
- `tests/incident-selection.test.ts`
- `tests/metrics-aggregation.test.ts`
- `tests/comparative-slices.test.ts`
- `tests/evaluator.test.ts`
- `tests/evaluator-integration.test.ts`
- `tests/html-report.test.ts`
- `tests/report.test.ts`
- `tests/presentation.test.ts`
- `tests/svg-charts.test.ts`
- `src/calibration/corpus.json`
- `src/calibration/runner.ts`
- `tests/calibration-runner.test.ts`

Exit criteria:
- scaffold-heavy corpora do not regress to duplicated template titles
- low-sample corpora clearly disclose low-confidence write-centric claims
- all three providers render the same top-level product shape

## Acceptance criteria
The cutover is complete only when all of the following are true:
- the first visible report section is a dashboard
- the report has a first-class “What worked” section
- the review queue no longer dominates the product framing
- surfaced titles/evidence are de-templated by default
- repeated scaffold titles do not dominate top rows
- template-heavy corpora are explicitly disclosed
- every surfaced session includes attribution, confidence, and reasons
- metrics include provider/tool/MCP/message/time breadth
- token/model gaps are shown as coverage gaps, not false zeros
- outputs remain deterministic and public-safe

## Anti-goals
Do not:
- solve this with more report-only HTML shuffling
- keep iterating on regex suppression as the primary strategy
- build a client-side app as a prerequisite
- preserve v2 operator-first compatibility layers
- let optional enrichment silently drive core ranking without disclosure

## Recommended delivery order
1. `schema-v3-contract-and-session-facts`
2. `dashboard-metrics-and-date-slices`
3. `template-registry-and-attribution`
4. `report-ia-and-regression-gates`

## Supersession note
This document supersedes the earlier operator-first redesign/planning notes. Those earlier docs should not be used as the source of truth for future work.