<!-- AGENTS ONLY: This file is exclusively for AI agents, not humans -->

**Keep this file updated** as you learn project patterns. Follow: concise, index-style, no duplication.

# AGENTS.md

Goals:
- Build a local transcript analytics engine for developer-agent session/log artifacts.
- Use transcript/session/log artifacts as canonical input.
- Discover the local environment dynamically.
- Prefer precision over recall in the core deterministic pipeline.
- Produce a public-safe dashboard + learning + review + attribution surface.

Constraints:
- Do not assume fixed file paths beyond common supported agent home conventions.
- Do not assume the shape of any local structured store. Discover it if present.
- Do not hardcode shell commands from the user. Explore and justify choices.
- Keep code strict, typed, and testable.
- Emit machine-readable artifacts and a markdown report.

Notes:
- Exploration outputs live under `notes/`; temporary redesign/QA investigation folders should stay ignored unless explicitly curated for publication, and binary screenshots/verification captures should live under ignored `notes/**/screenshots/` or `notes/**/verification/` paths. For release review, regenerate those captures locally and attach them to review/oracle archives as needed rather than treating them as committed repo assets.
- Canonical methodology should treat transcript JSONL under the selected source home as required input.
- Treat SQLite/log/history/shell snapshot stores as optional enrichment only.
- Keep generated analytics outputs under `artifacts/` untracked for this public repo.
- Favor deterministic parsing, labeling, clustering, and scoring as the canonical methodology.
- Generated analytics artifacts should prefer redacted, truncated previews over full transcript bodies.
- Incident evidence selection should prefer non-boilerplate user text over AGENTS or instruction dumps when possible.
- Treat orchestration wrappers like parallel-integration prompts, forked-session blocks, and subagent notifications as low-signal preview candidates.
- For large corpus runs, prefer the summary-only path that skips giant raw-turn/incidents artifacts.
- When `sessionLimit` is set, it must mean the most recent discovered sessions, not an arbitrary subset.
- Keep the public-facing layer useful for non-experts: maintain a balanced dashboard, learning surface, review queue, and attribution sections as deterministic derivatives.
- Keep trend reporting deterministic too: comparative slices should come from aggregated session metrics, and headline momentum should prefer a stable recent window over a twitchy tiny slice when possible.
- Keep summary logic split by responsibility: canonical core math, optional presentation decorations, and shared report section derivation should not collapse back into one giant module.
- Supported providers currently include Codex, Claude Code, and pi; parser and discovery changes should preserve a shared normalized session model.
