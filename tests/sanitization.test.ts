/**
 * Purpose: Verifies artifact previews are redacted and truncated before they are emitted into public-facing redaction outputs.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic text with home paths and email addresses to exercise deterministic redaction.
 */
import { describe, expect, it } from "vitest";

import {
  createMessagePreviews,
  isLowSignalPreview,
  isUnsafePreview,
  sanitizeMessageText,
} from "../src/sanitization.js";

describe("sanitizeMessageText", () => {
  it("redacts home paths and email addresses", () => {
    const sanitized = sanitizeMessageText(
      "See /Users/example/project and email me at dev@example.com for details.",
      {
        homeDirectory: "/Users/example",
        maxLength: 200,
      },
    );

    expect(sanitized).toContain("~/project");
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).not.toContain("/Users/example");
    expect(sanitized).not.toContain("dev@example.com");
  });

  it("truncates long previews deterministically", () => {
    const sanitized = sanitizeMessageText("a".repeat(40), {
      maxLength: 12,
    });

    expect(sanitized).toBe("[redacted...");
  });

  it("redacts ssh, identity, and abusive transcript fragments", () => {
    const sanitized = sanitizeMessageText(
      "DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/example_id_ed25519 Permission denied (publickey)",
      {
        maxLength: 200,
      },
    );

    expect(sanitized).toContain("[redacted-sensitive-content]");
    expect(sanitized).not.toContain("example_id_ed25519");
    expect(sanitized).not.toContain("SSH KEYS");
    expect(sanitized).not.toContain("FUCKING");
  });

  it("redacts milder insulting phrasing for public previews", () => {
    const sanitized = sanitizeMessageText("dumb question. obviously", {
      maxLength: 200,
    });

    expect(sanitized).toContain("[redacted-abusive-language]");
    expect(sanitized).not.toContain("dumb");
  });
});

describe("createMessagePreviews", () => {
  it("limits preview count", () => {
    const previews = createMessagePreviews(["one", "two", "three"], {
      maxItems: 2,
      maxLength: 50,
    });

    expect(previews).toEqual(["one", "two"]);
  });

  it("prefers human signal over AGENTS and environment boilerplate", () => {
    const previews = createMessagePreviews(
      [
        "# AGENTS.md instructions for /tmp/demo <INSTRUCTIONS>",
        "<environment_context> <cwd>/tmp/demo</cwd> </environment_context>",
        "Tests still fail after your patch. Please verify before ending.",
      ],
      {
        maxItems: 1,
        maxLength: 120,
      },
    );

    expect(previews).toEqual([
      "Tests still fail after your patch. Please verify before ending.",
    ]);
  });

  it("prefers safer evidence over sensitive transcript fragments", () => {
    const previews = createMessagePreviews(
      [
        "See the following: DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/example_id_ed25519",
        "Git pull failed after the deploy cutover and the repo now needs the SSH auth fix restored.",
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "Git pull failed after the deploy cutover and the repo now needs the SSH auth fix restored.",
    ]);
  });

  it("demotes skill catalogs and trust docs below concrete user problem statements", () => {
    const previews = createMessagePreviews(
      [
        "- create-subagent: Create custom subagents for specialized AI tasks. Use when you want to create a new type of subagent, set up task-specific agents, configure code reviewers, debuggers, or domain-specific assistants.",
        '### Repo Execution Trust - Repo-local executable settings are gated by local `.ralph/trust.jsonc`. - Trust file shape: `{"allow_project_commands": true}`.',
        "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
      ],
      {
        maxItems: 1,
        maxLength: 160,
      },
    );

    expect(previews).toEqual([
      "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
    ]);
  });

  it("avoids bare ssh recovery phrasing when safer same-turn evidence exists", () => {
    const previews = createMessagePreviews(
      [
        "• Checking the actual key state now. If the encrypted artifacts are usable, I’ll restore ~/.ssh immediately; if not, I’ll verify exactly where the key material still exists so we can recover it without guessing.",
        "Please make sure you have the correct access rights and the repository exists.",
      ],
      {
        maxItems: 1,
        maxLength: 160,
      },
    );

    expect(previews).toEqual([
      "Please make sure you have the correct access rights and the repository exists.",
    ]);
  });

  it("extracts higher-signal sections from structured batch briefings", () => {
    const previews = createMessagePreviews(
      [
        `# Cloop Batch 1: Loop Surface State + Next View UX

## Mission / Scope
Fully remediate loop-surface defects in the Inbox, Next, and adjacent loop-management views for Cloop's web UI.

## Defects To Eliminate
Top Incidents still shows orchestration wrappers instead of the actual user problem signal.

## Acceptance Criteria
Reports should show meaningful human evidence instead of batch boilerplate.`,
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "Top Incidents still shows orchestration wrappers instead of the actual user problem signal.",
    ]);
  });

  it("extracts the human question from JSON tool examples", () => {
    const previews = createMessagePreviews(
      [
        '**Ask the chat when stuck:** ```json {"tool":"chat_send","args":{"chat_id":"<same chat_id>","message":"How does X connect to Y in these files? Any edge cases I should watch for?","mode":"chat","new_chat":false}} ```',
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "How does X connect to Y in these files? Any edge cases I should watch for?",
    ]);
  });

  it("prefers concrete problem statements over completion-format instructions", () => {
    const previews = createMessagePreviews(
      [
        '- End your turn with a short "what changed / how to verify / what\'s next" summary.',
        "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
    ]);
  });

  it("extracts substantive items from inline numbered planning lists", () => {
    const previews = createMessagePreviews(
      [
        "Initial docs capturing the architecture and porting strategy 2. Wake-path spike implementation or proof-of-failure 3. Validation notes",
      ],
      {
        maxItems: 6,
        maxLength: 140,
      },
    );

    expect(previews).toContain(
      "Initial docs capturing the architecture and porting strategy",
    );
  });

  it("demotes request-wrapper upload instructions below the actual task", () => {
    const previews = createMessagePreviews(
      [
        "User request: Pro - Extended. Every file in this project included in the artifact upload. I want to port this tool for use in Cursor. I want to avoid MCP if possible.",
      ],
      {
        maxItems: 2,
        maxLength: 160,
      },
    );

    expect(previews[0]).toContain("I want to port this tool for use in Cursor");
  });
});

describe("isLowSignalPreview", () => {
  it("flags harness boilerplate previews", () => {
    expect(
      isLowSignalPreview(
        "# AGENTS.md instructions for /tmp/demo <INSTRUCTIONS>",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Parallel Integration (Mandatory) - Attempt 1/50 You are finalizing task `RQ-0025` for direct push to `origin/main`.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '<forked_session source="demo"> If you have already received a <forked_session> block with this same delivery_id...',
      ),
    ).toBe(true);
    expect(isLowSignalPreview("│ │ ├── planning-ui-verify-2026-03-16")).toBe(
      true,
    );
    expect(
      isLowSignalPreview(
        "31,188 tokens — well within the 158,500 budget. Let me verify the pre-halt checklist:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'Which ones would you like installed? """ After installing a skill, tell the user: "Restart Codex to pick up new skills."',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "HOST IS BOOTSTRAPPED: Work from the local repo root at ~/Projects/AI/parameter-golf. I will provide:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Return a concise markdown report with one section per form: either 'MATCH' or a bullet list of exact field corrections using dotted paths and corrected normalized values.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Hmm, I need to map the SponDescription values to these checkboxes, but the mappings aren’t visible, making it tricky! **Verifying sponsor codes** I need to verify the sponsor codes as well.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If a value is unreadable, mark it as NEEDS_HUMAN_REVIEW. Forms: WF01285441, WF02271341.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'uv run --python 3.14 python scripts/runpod_run_with_sync.py --host "$IP" --port "$PORT"',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Forms: WF01285441, WF02271341, WF12842103."),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Work from the local repo root at ~/Projects/AI/parameter-golf.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Task: Audit this batch of CCS Non-IVP 2026 forms by visually comparing each rendered contact sheet image against its draft groundtruth JSON.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("PRIMARY SCREEN (Rank 1: MLP_MULT=4.0, seed 1337)"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "FALLBACK SCREEN (only if primary crashes, is over cap, or is clearly non-competitive)",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I'm considering using a multi-tool approach to read multiple JSON files and images simultaneously.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I guess the codes could be 10 or 123, possibly related to the JOBS Program and Physical Therapist.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "There's definitely a process here, and I want to ensure I cover all aspects effectively!",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I'll check in on any updates or tasks that need attention. Keeping it structured might help me stay on top of everything!",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "So, I’ll take a moment to read the relevant files to see if there’s anything I need to pay special attention to. It’s just good practice to double-check, I guess!",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Maybe I should also consider if there's a way to sponsor p2 while I'm at it? Let's create that top zoom—it might make things easier to visualize and solve whatever the issue is.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "It feels like there's a need to clarify this before moving forward. Maybe I should also consider if there's a way to sponsor p2 while I'm at it?",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Searching for progress file** I need to find the progress.md file, but it doesn't seem to be present.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I need to find the progress.md file, but it doesn't seem to be present in the output from rg.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Let's explore this further! **Planning for image analysis** I think I need to read the images, as there are possibly about 11 contact sheets.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I want to make sure everything is in order and nothing is overlooked, so going through these contacts carefully is important.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Overall, I want to streamline this process so everything is organized and easy to access. Let's see how this works out!",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "scripts/runpod_run_with_sync.py will sync back run.log, logs/*.txt, and merge results.tsv locally.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The command above captures remote training output into /root/parameter-golf/run.log.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("we need to do a proper release once you've tested"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '<subagent_notification> {"agent_id":"demo","status":{"completed":"done"}}',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Deep Investigation Mode Investigate: You are an autonomous public-release hardening agent.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "$comprehensive-codebase-audit $rp-reminder group the findings based on whether an agent can remediate them together or not.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "PLEASE IMPLEMENT THIS PLAN: ## Fix Legacy Config Upgrade Path",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- **Performance bottlenecks** (resource leaks, algorithmic inefficiency)",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Performance bottlenecks** (resource leaks, algorithmic inefficiency)",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- **Architectural debt** that hinders scaling and maintenance",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**SEVERITY:** 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Full Catalog**: All violations grouped by category with severity",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '- **Ignoring "it works"**: Working code can still have architectural debt',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Roadmap items must be chunky, implementation-oriented workstreams.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Problem: Violates SRP, impossible to test, high coupling",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Impact: Changes require modifying 1 file, high regression risk",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '- Fix: Use parameterized queries: db.Query("SELECT * FROM users WHERE id = ?", userID)',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Add your findings to the repo canonical roadmap when complete.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Add/update only when: locally explored enough"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Before we make edits, you should read the pi code to make sure we optimize the prompts.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Local work is **discovery only**; real submissions need **8×H100 SXM, 3 seeds**.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**RULE 2:** When you say you are going to make a tool call make sure you ACTUALLY make the tool call.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "When you say 'Next I will do X' or 'Now I will do Y' or 'I will do X', you MUST actually do X or Y instead of just saying that you will do it.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Saved references and persisted objects can reuse them in later cells, but async callbacks that fire after a cell finishes still fail because no exec is active.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I did not find a discrete correctness regression in this commit. The duplicate-handling change is internally consistent.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Perform a systematic, exhaustive analysis of the entire codebase to identify:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Work through each category systematically. For each violation found, capture:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Action-biased**: next experiment, cleanup, revert, promotion, or handoff improvement.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Good turn**: substantive improvement + log + commit + push + clean tree.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Deliverable:** List top 10 largest files by line count. Flag any >300 lines.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "2. Establish the problem narrowly - Confirm from logs/trainer output what the current default limits are.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("- Identify the primary language(s) and framework(s)"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Dynamic langs: implicit conversions, missing hasattr/typeof checks",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("[SEVERITY] [CATEGORY] path/to/file.ext:Line"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "On unexpected failure: diagnose to **clear cause**, don’t spiral.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "4. On unexpected failure: diagnose to **clear cause**, don’t spiral.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Research by doing**: each run should add **labeled numbers**.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**If the frontier feels out of reach**, still move: reproducibility first.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Bounded, novel ideas are fine when H100-portable and low-risk.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "You are Agent B at the repo root of **parameter-golf**. **Repo files are truth**, not chat memory.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The human starts you **once**. After **each** turn you finish, the system automatically sends this entire prompt again.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "That repeats **until the human manually interrupts**—there is no built-in stop when satisfied.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "After **each** turn you finish, the system **automatically sends this entire prompt again**. That repeats **until the human manually interrupts**.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Prefer raw artifacts such as example prompts, outputs, diffs, logs, or traces.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Give the minimum task-local context needed to perform the validation.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Avoid passing the intended answer, suspected bug, intended fix, or your prior conclusions unless the validation explicitly requires them.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Will that still accomplish the purpose of and the goal of what we're trying to look for with this run?",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "2. **B** — One **controlled** higher-upside, low-risk, H100-portable delta.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If you catch yourself thinking **“I don’t know what else to do,”** that is a **signal to experiment**, not to stall.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "while your implementation demonstrates strong intentions and attention to detail, it unfortunately falls short on our standards",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("Claiming completion eh?")).toBe(true);
    expect(
      isLowSignalPreview(
        "You may use subagents during iteration to validate whether a skill works on realistic tasks or whether a suspected problem is real.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("You may use subagents")).toBe(true);
    expect(
      isLowSignalPreview(
        "This is most useful when you want an independent pass on the skill's behavior, outputs, or failure modes after a revision.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "scout can continue to use 'openai-codex/gpt-5.4-mini'.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Assume changes were made by you in a previous session.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Yes these are the right prompts in order of precedence. They are invoked by the `pi` tool.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("They are invoked by the `pi` tool.")).toBe(true);
    expect(
      isLowSignalPreview(
        "description: Guide for creating effective skills. This skill should be used when users want to create a new skill.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- The skills at [redacted-url] are preinstalled, so no need to help users install those.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Use `{ ... }` only for a short temporary block when you specifically need local scratch names.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Do NOT discard findings that require long local runs — they are valid H100-portable evidence.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "M1 Max is vastly slower per-step, so a 500s / 1200-step local run proxies what H100 can do in far fewer steps. Do NOT discard findings that require long local runs — they are valid H100-portable evidence.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Planning codebase inventory** I need to gather a codebase inventory.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I'll also want to ensure that I identify the correct location of the roadmap by scanning the code systematically.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("I need to gather a codebase inventory.")).toBe(
      true,
    );
    expect(isLowSignalPreview("If you disagree let me know.")).toBe(true);
    expect(isLowSignalPreview("3. remaining risks or next steps")).toBe(true);
    expect(
      isLowSignalPreview(
        "For user-facing UI or UX changes, verify the rendered result with VISUAL inspection (for example screenshots), do not rely on code review.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Every code file MUST have a top-of-file purpose header comment that covers: Purpose, Responsibilities, Scope, Usage, Invariants/Assumptions.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Executable scripts MUST have a useful `-h, --help` menu with comprehensive examples and exit codes.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Update the generator or source-of-truth, then regenerate.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Do not end a turn with a live background remote job still running.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If validation surfaces failures, you always own triage and remediation even if the issue appears unrelated to your work.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If unrelated user changes are present, preserve them quietly, keep my blast radius isolated, and report only the files I actually touched instead of handoff-style caveats.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "RTX should consume the highest-priority unresolved item in `Queue for RTX` before starting unrelated exploration.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "--- kind: agent_rules_canon project: azdps-document-ai version: 1.3.1",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Do not ask for permission for routine verification, diff inspection, reconciliation, or adjacent analysis.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Stop and ask only if the next step would materially change behavior, overwrite user-authored content, require a strategic choice, or incur significant time/cost/tool usage.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If push is impossible (no network/credentials), still commit and note the blocker.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Process cleanup must be PID/process-group scoped only; never use global `pkill`/`killall`.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "subagent parallel (3) ⚠ parallel 2/3 | 252 tools, 1713k tok, 38m45s",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("⚠ parallel 2/3 | 252 tools, 1713k tok, 38m45s"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "✓ Step 1: scout (openai-codex/gpt-5.4-mini:high) | 78 tools, 8m34s",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "## Core Working Rules _ Be concise, direct, and clear.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- ALWAYS ensure proper resource cleanup to avoid leaks and zombie processes.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("Stabilize them.")).toBe(true);
    expect(
      isLowSignalPreview(
        "- Continue working until there is no clear low-risk local next step.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Add or update tests for changed behavior and important failure modes when practical.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("- Do not manually edit generated files.")).toBe(
      true,
    );
    expect(
      isLowSignalPreview(
        "- This machine runs many projects concurrently; cleanup must only target project-spawned processes.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- RTX should consume the highest-priority unresolved item in `Queue for RTX` before starting unrelated exploration.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("- Verify work before declaring completion."),
    ).toBe(true);
    expect(
      isLowSignalPreview("is repo state clean and up to date with remote?"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Now I need to run the full `LOCAL-SHARED-65K512-400-FIXED` canonical baseline.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The canonical MLX baseline smoke test passed. Now I need to run the full shared protocol.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Build an explicit list of the **active MLX baseline/control anchors** that need replacement under the new cache policy.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- context cancellation (respecting ctx.Done() in long operations)",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If you start Orbit dev servers, automation/test processes, temp profiles/workspaces, simulators, or other project background helpers, stop them and verify no project-owned/orphaned runtime artifacts remain.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Note**: Scripts may still need to be read by Codex for patching or environment-specific adjustments",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "You will need to source this file to load it into your current session though.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The finished skill and its reference guide are on disk. I’m checking the rendered files now.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I’m checking the rendered files now, then I’ll run the skill validator and a final `gog` smoke test so we can trust the install.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The broad `find ..` is noisy; I’m narrowing to the repo root AGENTS files only.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I’m narrowing the skill to the parts another agent will actually need: executable name, bootstrap steps, and defaults.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Provide prioritized, actionable findings."),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '{"findings":[],"overall_correctness":"patch is correct"}',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '- The phrase "eval" here means **contract verification** (does this provider produce output that passes Orbit\'s normalization + schema boundaries?), not LLM-as-judge or generation quality scoring.',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'The phrase "eval" here means **contract verification** (does this provider produce output that passes Orbit\'s normalization + schema boundaries?), not LLM-as-judge or generation quality scoring.',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Roadmap items must be chunky, implementation-oriented workstreams; combine tightly coupled cleanup, proof, and stabilization work instead of splitting them into tiny tasks.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "To create an effective skill, clearly understand concrete examples of how the skill will be used.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'Example: When building a `pdf-editor` skill to handle queries like "Help me rotate this PDF," the analysis shows:',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Target Objective:** Replace raw JSON-only candidate comparison in the four AI authorities.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- **Target Objective:** Replace raw JSON-only candidate comparison in the four AI authorities.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "6. Preserve trust signals by showing them on the selected/baseline panels.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Preserve trust signals by showing them on the selected/baseline panels and by adding raw full-response JSON access.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "3. Derive a top-level `DoctorReport.blocking` from those annotated checks.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Derive a top-level `DoctorReport.blocking` from those annotated checks.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Run the relevant tests, lint, format, and type checks for touched code before ending your turn.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Every code file MUST have a top-of-file purpose header comment that covers: Purpose, Responsibilities, Scope, Usage, Invariants/Assumptions.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Executable scripts MUST have a useful `-h, --help` menu with comprehensive examples and exit codes.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "7. **Keep UI trust signals explicit:** manually edited badge and raw response JSON access.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Generator note:** if the generate request contract exposes an optional prior candidate.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- **The Why:** Operators currently get canonical blocking explanations in run/queue machine surfaces.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "When freshness matters, verify against current official or primary sources.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Add or update tests for changed behavior and important failure modes when practical.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Execute obvious, low-risk next steps within scope."),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "The skills at [redacted-url] are preinstalled, so no need to help users install those.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Should continuity be primarily local-to-device/session, or is there value in persisting a richer operator history inside the core DB?",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'loop.next_action ? "Existing next action remains valid." : "A new next action may still need operator clarification.",',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "nudge: 'Hey — wanted to circle back while this was still fresh on my mind.',",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "'Hey Sarah — wanted to check in while recovery is still very present. Do you have a few minutes later today?',",
      ),
    ).toBe(true);
    expect(isLowSignalPreview('"""')).toBe(true);
    expect(
      isLowSignalPreview(
        "? `This draft still matches the last saved profile, but differs from AI Attempt 3.`",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "* Responsibilities: Preserve artifacts, trust metadata, diagnostics, and raw responses across all AI authoring modals.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Legal**: no validation leakage, no stale comparison framing, and no mutation of persisted operator edits.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Treat every copy of this message as a new turn and only use state persisted outside the prompt.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "[ ] **Missing Cleanup**: No defer/finally/using blocks for resources",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If it does **not**, still preserve the manual attempt as the active candidate/baseline and preserve the request draft state.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Use a gitignored `.scratchpad.md` file only when needed for state, long-horizon planning, or breadcrumbs across stateless sessions.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "6. I trust the system because provenance, assumptions, and rollback are clear.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Public merged anchor is still PR `#549` at `1.1194`.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- MLX findings only directly generalize on the intersection of `train_gpt_mlx.py` and `train_gpt.py`; CUDA validation is required before promoting shared-knob wins to recipe status.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "Use it constantly before and during work to keep getting to the real goal, not as a formality but as a way to find tighter, simpler, more useful solutions.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Do not end a turn with permission-seeking offers when a clear low-risk next step exists.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Do not ask for permission for routine verification, diff inspection, reconciliation, or adjacent analysis.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("- goroutine leaks (unbounded goroutine creation)"),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "<skill> <name>rp-build</name> <path>~/.agents/skills/rp-build/SKILL.md</path> repoprompt_managed: true",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "<system message> Your job is to: 1. Analyze the requested change against the provided code.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "## Communication - Be concise and direct. - Do not end a turn with permission-seeking offers when a clear low-risk next step exists.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "## Non-Negotiables - Run relevant tests, linters, formatters, and type-checkers before ending your turn.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# MISSION You are Task Builder for this repository. ## AGENT SWARM INSTRUCTION",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Cloop Batch 1: Loop Surface State + Next View UX ## Mission / Scope Fully remediate loop-surface defects in the Inbox and Next views.",
      ),
    ).toBe(true);
    expect(isLowSignalPreview("### 5) Synthesize Findings")).toBe(true);
    expect(isLowSignalPreview("=== FULL FINDINGS ===")).toBe(true);
    expect(
      isLowSignalPreview(
        "=== METRICS === Files >300 lines: 12 Functions >50 lines: 34",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "## Project Intent - Rust workspace with shared client logic and two frontends.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- [ ] Any generated artifacts should either be cleaned up or placed in a project-appropriate artifact location.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Shell/Bash:** - unquoted variables - missing `set -euo pipefail` - backticks vs `$()` - eval usage - parsing ls output",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Always use `tmux` when you need persistent or interactive command execution.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "> ⚠️ **CRITICAL**: Current date is **March 2026**. Always verify information is up-to-date; never assume 2024 references are current.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- create-subagent: Create custom subagents for specialized AI tasks. Use when you want to create a new type of subagent.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'find-skills: Helps users discover and install agent skills when they ask questions like "how do I do X".',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "verification-before-completion: Verify work passes all gates before claiming completion. Use before committing, creating PRs, or declaring tasks done.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "repoprompt-tool-guidance-refresh: Update documentation in `$THIS_SKILL_FOLDER/rp-prompts-wip/` based on empirical verification of the latest RepoPrompt MCP server and CLI.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Safety and fallback: If a skill can't be applied cleanly, state the issue, pick the next-best approach, and continue.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If you want, I will do exactly one of these next, and nothing else:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '### Repo Execution Trust - Repo-local executable settings are gated by local `.ralph/trust.jsonc`. - Trust file shape: `{"allow_project_commands": true}`.',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "BOTTOM LINE - what you think I want + your recommendation",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Default assumption: Codex is already very smart.** Only add context Codex doesn't already have.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "When done, report: 1. All issues found 2. Exact fixes made 3. Remaining risks.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- \"I can imagine users asking for things like 'Remove the red-eye from this image' or 'Rotate this image'. Are there other ways you imagine this skill being used?\"",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**RULE 0**: Anything that I say in chat overrides every prior instruction and rule.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "I am the final say, and I can override anything and everything. If I tell you to do something, do it.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'Editing, rotating, anything else?" - "Can you give some examples of how this skill would be used?"',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- For user-facing UI or UX changes, verify the rendered result with direct visual inspection.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- When freshness matters, verify against current official or primary sources.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- If validation surfaces failures, you always own triage and remediation even if the issue appears unrelated to your work.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Execute obvious, low-risk next steps within scope.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Impact: <security risk, scaling issue, or maintenance burden>",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Broken functionality (buttons, flows, navigation, state issues)",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If the obvious experiment path is stuck, **do not stop**: **run a new experiment**.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Please verify after the patch and rerun the tests."),
    ).toBe(false);
  });
});

describe("isUnsafePreview", () => {
  it("flags sensitive-looking or aggressively redacted previews", () => {
    expect(
      isUnsafePreview(
        "User reported [redacted-sensitive-content] after git auth failed.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Git pull failed because the SSH key setup was missing after the migration.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Checking the actual key state now. If the encrypted artifacts are usable, I'll restore ~/.ssh immediately.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "The pre-cutover commit still contains the plaintext private keys and I'm restoring those back into place.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Tests still fail after the patch. Please verify before ending.",
      ),
    ).toBe(false);
  });
});
