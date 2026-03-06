<!-- AGENTS ONLY: This file is exclusively for AI agents, not humans -->

**Keep this file updated** as you learn project patterns. Follow: concise, index-style, no duplication.

# AGENTS.md

Goals:
- Build a local evaluator for Codex session/log artifacts.
- Use transcript/session/log artifacts as canonical input.
- Discover the local environment dynamically.
- Prefer precision over recall in v1.
- Produce artifacts suitable for a technical blog post.

Constraints:
- Do not assume fixed file paths beyond common Codex home conventions.
- Do not assume the shape of any local structured store. Discover it if present.
- Do not hardcode shell commands from the user. Explore and justify choices.
- Keep code strict, typed, and testable.
- Emit machine-readable artifacts and a markdown report.

Notes:
- Exploration outputs live under `notes/`.
- Canonical methodology should treat `~/.codex/sessions/**/*.jsonl` as required input.
- Treat SQLite/log/history/shell snapshot stores as optional enrichment only.
- Keep generated evaluator outputs under `artifacts/` untracked for this public repo.
- Favor deterministic parsing, labeling, clustering, and scoring as the canonical methodology.
- Generated evaluator artifacts should prefer redacted, truncated previews over full transcript bodies.
- Incident evidence selection should prefer non-boilerplate user text over AGENTS or instruction dumps when possible.
- Treat orchestration wrappers like parallel-integration prompts, forked-session blocks, and subagent notifications as low-signal preview candidates.
- For large corpus runs, prefer the summary-only path that skips giant raw-turn/incidents artifacts.
- When `sessionLimit` is set, it must mean the most recent discovered sessions, not an arbitrary subset.
- Keep the public-facing layer useful for non-experts: maintain shareable scorecards, brag stats, and clean-session spotlight sections as deterministic derivatives.
- Keep trend reporting deterministic too: comparative slices should come from aggregated session metrics, and headline momentum should prefer a stable recent window over a twitchy tiny slice when possible.
