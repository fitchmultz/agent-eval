/**
 * Purpose: Redacts, ranks, and truncates free-form transcript text before it is emitted into analytics artifacts.
 * Entrypoint: `createMessagePreviews()` is used by the analytics pipeline and report layer when generating outputs.
 * Notes: v1 favors compact redacted previews and prioritizes human-authored signal over harness boilerplate.
 */

import { SANITIZATION } from "./constants/index.js";
import { redactPath } from "./utils/path-redaction.js";

/**
 * Options for creating message previews.
 */
export interface PreviewOptions {
  /** Home directory path to redact (replaced with ~) */
  homeDirectory?: string | undefined;
  /** Maximum length for each preview string */
  maxLength: number;
  /** Maximum number of preview items to return */
  maxItems: number;
}

const lowSignalPatterns = [
  /AGENTS\.md instructions/i,
  /^# AGENTS/i,
  /^#\s*[^\n#]{0,120}\bBatch\s+\d+\b/i,
  /^# Parallel Integration/i,
  /^# Deep Investigation Mode/i,
  /^#{1,6}\s*\d+[.)]\s+/i,
  /^=+\s*[A-Z][A-Z\s]+\s*=+(?:\s|$)/,
  /<INSTRUCTIONS>/i,
  /GLOBAL AGENTS GUIDANCE/i,
  /<codex reminder>/i,
  /<environment_context>/i,
  /^<skill>/i,
  /^<system message>/i,
  /<turn_aborted>/i,
  /<subagent_notification>/i,
  /^subagent parallel \(\d+\)/i,
  /^⚠\s*parallel\b/i,
  /^✓\s*Step\s+\d+:/i,
  /^# Builder Mode Task/i,
  /^##\s*Communication\b/i,
  /<forked_session/i,
  /\bYou are finalizing task\b/i,
  /\bYou are an autonomous\b/i,
  /\bHard Requirement\b/i,
  /\bdirect push to `?origin\/main`?\b/i,
  /^Answer these questions\./i,
  /^<[^>]+>$/i,
  /^\$[a-z0-9._-]+(?:\s+\$[a-z0-9._-]+)*(?:\s|$)/i,
  /^please implement this plan:/i,
  /^# mission\b/i,
  /^## Core Working Rules\b/i,
  /^## Non-Negotiables\b/i,
  /^group\s+\d+:/i,
  /\bcopy this into a new agent session\b/i,
  /\bagent swarm instruction\b/i,
  /\breview criteria:\b/i,
  /\byour job is to:\b/i,
  /\brepoprompt_(?:managed|skill_path|skills_version):/i,
  /\bThis batch owns\b/i,
  /\bNo minimal slices\b/i,
  /\b(?:Mission\s*\/\s*Scope|Defects To Eliminate|Priority\s*\/\s*Rationale|Acceptance Criteria|Required Verification|Runtime Notes|Safety Precautions|Working Directives|Visual Validation Reminder|Completion Rule)\b/i,
  /\bThe human user will interrupt if they need your attention\b/i,
  /\bDo not use automatically, only when invoked explicitly\b/i,
  /\*\*Ask the chat when stuck:/i,
  /\bSKILL\.md\b/i,
  /\bchat_send\b.*\bnew_chat\b/i,
  /^\s*##\s*Project Intent\b/i,
  /\*\*Skill\*\*/i,
  /\b(?:ask-clarifying-questions|root-cause-triage)\b/i,
  /\bThe user interrupted the previous turn on purpose\b/i,
  /\bIf any tools\/commands were aborted\b/i,
  /^\s*-\s*\[[ x]\]/i,
  /\bGroup\s+\d+\s+last\b/i,
  /\bIf you want, I can now do the same grouping\b/i,
  /\bEnd your turn with a short\b/i,
  /\bwhat changed\s*\/\s*how to verify\s*\/\s*what'?s next\b/i,
  /\bcreate-rule:\b/i,
  /\bCursor rules\b/i,
  /\bfile-specific patterns\b/i,
  /"message"\s*:/i,
  /\bAlways use `?tmux`?\b/i,
  /\b`?tracked-paths\.tsv`?\s+is authoritative\b/i,
  /\bThe current source checkout may live at\b/i,
  /\bExit codes:\b/i,
  /\bAgent Rules For Drift Control\b/i,
  /\bCurrent date is\b.*\bAlways verify information is up-to-date\b/i,
  /^-?\s*Missing\/blocked:/i,
  /^-?\s*Safety and fallback:/i,
  /^If you want, I will do exactly one of these next\b/i,
  /^If you want, I can now do the same\b/i,
  /^BOTTOM LINE\b/i,
  /\bwhat you think I want\s*\+\s*your recommendation\b/i,
  /^\*\*Default assumption:/i,
  /^Only add context\b/i,
  /^Challenge each piece of information:/i,
  /^When done, report:/i,
  /^- Before\b/i,
  /^[-•]\s*"?I can imagine users asking for things like\b/i,
  /^\[\s*[x ]\s*\]\s*\*\*Missing Cleanup\*\*:/i,
  /\bAre there other ways you imagine this skill being used\?/i,
  /\bCan you give some examples of how this skill would be used\?/i,
  /\bWhat would a user say that should trigger this skill\?/i,
  /\bWhere should I create this skill\?/i,
  /\bEditing, rotating, anything else\?/i,
  /^\*\*RULE\s+\d+:?\*\*/i,
  /\boverrides every prior instruction and rule\b/i,
  /\bI am the final say, and I can override anything and everything\b/i,
  /\bIf I tell you to do something, do it\b/i,
  /^[-•]\s*For user-facing UI or UX changes, verify\b/i,
  /^For user-facing UI or UX changes, verify\b/i,
  /^[-•]\s*If validation surfaces failures\b/i,
  /^If validation surfaces failures\b/i,
  /^[-•]\s*When freshness matters, verify against current official or primary sources\.?$/i,
  /^When freshness matters, verify against current official or primary sources\.?$/i,
  /^[-•]\s*Execute obvious, low-risk next steps within scope\.?$/i,
  /^[-•]\s*(?:if|when|use|add|update|keep|prefer|avoid|execute|start|end|run|read|write|create|generate|validate|focus|inspect|report|return|request)\b/i,
  /^[-•]\s*Impact:\s*<[^>]+>$/i,
  /^[-•]\s*Broken functionality\s*\([^)]+\)$/i,
  /^[│├└─\s]+[A-Za-z0-9._/-]+(?:-\d{4}-\d{2}-\d{2})?$/,
  /^\d{1,3}(?:,\d{3})+\s+tokens\b/i,
  /\bwell within the\s+\d{1,3}(?:,\d{3})+\s+budget\b/i,
  /\bpre-halt checklist\b/i,
  /^Follow the context prompt instructions and always include AGENTS\.md\b/i,
  /^Now let me verify the final token count:?$/i,
  /^- Need bundle-oriented diff output\b/i,
  /^- Need semantic parity across human CLI\b/i,
  /^HOST IS BOOTSTRAPPED:/i,
  /^Return a concise markdown report with one section per form:/i,
  /^If a value is unreadable, mark it as NEEDS_HUMAN_REVIEW\./i,
  /^Forms:\s*WF[A-Z0-9_,.-]+/i,
  /^Task:\s*Audit this batch of CCS Non-IVP 2026 forms\b/i,
  /^PRIMARY SCREEN\b/i,
  /^FALLBACK SCREEN\b/i,
  /^I['’]m considering using a multi-tool approach\b/i,
  /^I guess the codes could be 10 or 123\b/i,
  /^There['’]s definitely a process here, and I want to ensure I cover all aspects effectively\b/i,
  /^I['’]ll check in on any updates or tasks that need attention\b/i,
  /^So, I['’]ll take a moment to read the relevant files to see if there['’]s anything I need to pay special attention to\b/i,
  /^Maybe I should also consider if there['’]s a way to sponsor p2\b/i,
  /^It feels like there['’]s a need to clarify this before moving forward\b/i,
  /^\*\*Searching for progress file\*\*/i,
  /^I need to find the progress\.md file, but it doesn['’]t seem to be present\b/i,
  /^Let['’]s explore this further!\s*\*\*Planning for image analysis\*\*/i,
  /^Overall, I want to streamline this process so everything is organized and easy to access\b/i,
  /^I want to make sure everything is in order and nothing is overlooked\b/i,
  /^scripts\/runpod_run_with_sync\.py will sync back run\.log\b/i,
  /^The command above captures remote training output into \/root\/parameter-golf\/run\.log\./i,
  /^Work from the local repo root at\b/i,
  /^uv run --python\b/i,
  /^we need to do a proper release once you've tested$/i,
  /^Hmm,?\s+I need to map the SponDescription values to these checkboxes\b/i,
  /^Which ones would you like installed\?\s*"""\s*After installing a skill, tell the user:\s*"Restart Codex to pick up new skills\./i,
  /^Which ones would you like installed\?\b/i,
  /^[-•]?\s*\*\*(?:Performance bottlenecks|Security vulnerabilities|Architectural violations|Architectural debt|Testing gaps|Maintainability issues)\*\*/i,
  /^\*\*SEVERITY:\*\*/i,
  /^\*\*Full Catalog\*\*:/i,
  /^[-•]\s*\*\*[^*]+\*\*:/i,
  /^[-•]\s*Roadmap items must be\b/i,
  /^Add your findings to the repo canonical roadmap\b/i,
  /^Add\/update only when:/i,
  /^Roadmap items must be chunky, implementation-oriented workstreams\b/i,
  /^To create an effective skill, clearly understand concrete examples of how the skill will be used\b/i,
  /^[-•]?\s*\*\*Target Objective:\*\*/i,
  /^\d+\.\s+Preserve trust signals by showing them\b/i,
  /^Preserve trust signals by showing them\b/i,
  /^\d+\.\s+\*\*Keep UI trust signals explicit:\*\*/i,
  /^\d+\.\s+Derive a top-level `?DoctorReport\.blocking`?\b/i,
  /^Derive a top-level `?DoctorReport\.blocking`?\b/i,
  /^Run the relevant tests, lint, format, and type checks for touched code before ending your turn\.?$/i,
  /^Every code file MUST have a top-of-file purpose header comment\b/i,
  /^\*\*Generator note:\*\*/i,
  /^[-•]?\s*\*\*The Why:\*\*/i,
  /^Before we make edits, you should read\b/i,
  /^Local work is \*\*discovery only\*\*/i,
  /^If repo evidence or a sharp \*\*Why\*\*/i,
  /^[a-z]\)\s+After producing the required phase output\b/i,
  /^Perform a systematic, exhaustive analysis of the entire codebase to identify:/i,
  /^Work through each category systematically\. For each violation found, capture:/i,
  /^\*\*(?:Action-biased|Good turn|Bad turn)\*\*:/i,
  /^\*\*Deliverable:\*\*/i,
  /^(?:\d+\.\s*)?Establish the problem narrowly\b/i,
  /^- Identify the primary language\(s\) and framework\(s\)/i,
  /^- Dynamic langs:\s/i,
  /^\[SEVERITY\]\s+\[CATEGORY\]\s+path\/to\/file\.ext:Line$/i,
  /^(?:\d+\.\s*)?On unexpected failure: diagnose to \*\*clear cause\*\*/i,
  /^\*\*Research by doing\*\*:/i,
  /^\*\*If the frontier feels out of reach\*\*/i,
  /^Bounded, novel ideas are fine when H100-portable and low-risk\./i,
  /^Will that still accomplish the purpose of and the goal of what we're trying to look for with this run\?/i,
  /^You are Agent [A-Za-z0-9_-]+ at the repo root of \*\*[^*]+\*\*\./i,
  /^The human starts you \*\*once\*\*\./i,
  /\bAfter \*\*each\*\* turn you finish\b/i,
  /^That repeats \*\*until the human manually interrupts\*\*/i,
  /\bThat repeats \*\*until the human manually interrupts\*\*/i,
  /^Prefer raw artifacts such as example prompts, outputs, diffs, logs, or traces\./i,
  /^Give the minimum task-local context needed to perform the validation\./i,
  /^Avoid passing the intended answer, suspected bug, intended fix, or your prior conclusions\b/i,
  /^-?\s*(?:Problem|Impact|Fix|Root cause|Recommendation|Severity|Violation):\s/i,
  /^[-•]\s*(?:[a-z][a-z0-9/-]*\s+){0,5}[a-z][a-z0-9/-]*\s*\([^)]+\)$/i,
  /^\d+\.\s*\*\*[A-Z]\*\*\s*[—-]/,
  /^Saved references and persisted objects can reuse them in later cells\b/i,
  /^I did not find a discrete correctness regression in this commit\b/i,
  /^If you catch yourself thinking\b/i,
  /^If you truly need a rogue-run safety fuse\b/i,
  /^When you say ['"]Next I will do X['"] or ['"]Now I will do Y['"] or ['"]I will do X['"]/i,
  /^while your implementation demonstrates strong intentions\b/i,
  /^Claiming completion eh\?/i,
  /\bYou may use subagents\b/i,
  /^You may use subagents during iteration to validate whether a skill works on realistic tasks\b/i,
  /^This is most useful when you want an independent pass on the skill'?s behavior\b/i,
  /^scout can continue to use\b/i,
  /^Assume changes were made by you in a previous session\b/i,
  /^Yes these are the right prompts in order of precedence\b/i,
  /^They are invoked by the `?pi`? tool\./i,
  /^description:\s*Guide for creating effective skills\b/i,
  /^This skill should be used when users want to\b/i,
  /^metadata:\s*short-description:/i,
  /^- The skills at \[redacted-url\] are preinstalled\b/i,
  /^The skills at \[redacted-url\] are preinstalled\b/i,
  /^Example: When building a `?[a-z0-9_-]+`? skill\b/i,
  /^Use `?\{ \.\.\. \}`? only for a short temporary block\b/i,
  /^\*\*Planning codebase inventory\*\*/i,
  /^I(?:'ll| will) also want to ensure that I identify the correct location of the roadmap\b/i,
  /^I need to gather a codebase inventory\./i,
  /^If you disagree let me know\.?$/i,
  /^\d+\.\s+remaining risks or next steps$/i,
  /^- Public merged anchor is still PR `?#\d+`? at `?[\d.]+`?\./i,
  /^Update the generator or source-of-truth, then regenerate\./i,
  /^- Every code file MUST have a top-of-file purpose header comment\b/i,
  /^Every code file MUST have a top-of-file purpose header comment\b/i,
  /^- Executable scripts MUST have a useful `?-h, --help`? menu\b/i,
  /^Executable scripts MUST have a useful `?-h, --help`? menu\b/i,
  /^- Do not end a turn with a live background remote job still running\./i,
  /^- Stop and ask only if the next step would materially change behavior\b/i,
  /^- MLX findings only directly generalize on the intersection of `?train_gpt_mlx\.py`? and `?train_gpt\.py`?\b/i,
  /^Use it constantly before and during work to keep getting to the real goal\b/i,
  /^If you start [A-Za-z0-9_-]+ dev servers, automation\/test processes\b/i,
  /^\*\*Note\*\*: Scripts may still need to be read by Codex\b/i,
  /^Provide prioritized, actionable findings\.?$/i,
  /^You will need to source this file to load it into your current session though\b/i,
  /^I['’]m narrowing the skill to the parts another agent will actually need\b/i,
  /^The finished skill and its reference guide are on disk\b/i,
  /^I['’]m checking the rendered files now, then I['’]ll run the skill validator\b/i,
  /^The broad `?find \.\.`? is noisy; I['’]m narrowing\b/i,
  /^Use when a user asks to list installable skills, install a curated skill\b/i,
  /^MLX findings only directly generalize on the intersection of `?train_gpt_mlx\.py`? and `?train_gpt\.py`?\b/i,
  /^- The phrase "eval" here means \*\*contract verification\*\*/i,
  /^The phrase "eval" here means \*\*contract verification\*\*/i,
  /^- Should continuity be primarily local-to-device\/session\b/i,
  /^loop\.next_action\s*\?/i,
  /^\{"findings":\[\],"overall_correctness":/i,
  /^nudge:\s*['"]/i,
  /^['"]?Hey [A-Z][a-z]+ [—-] wanted to check in\b/i,
  /^"""$/,
  /^\?\s*`This draft still matches the last saved profile\b/i,
  /^\*\s*Responsibilities: Preserve artifacts, trust metadata, diagnostics, and raw responses\b/i,
  /^\*\s*Responsibilities:\s+/i,
  /^\*\*Legal\*\*:\s+/i,
  /^Treat every copy of this message as a new turn\b/i,
  /^If it does \*\*not\*\*, still preserve the manual attempt as the active candidate\/baseline\b/i,
  /^Use a gitignored `?\.scratchpad\.md`? file only when needed\b/i,
  /^\d+\.\s*I trust the system because\b/i,
  /\bDo NOT discard findings that require long local runs\b/i,
  /^If push is impossible\b/i,
  /^If unrelated user changes are present, preserve them quietly\b/i,
  /^RTX should consume the highest-priority unresolved item\b/i,
  /^---\s+kind:\s+agent_rules_canon\b/i,
  /^- This machine runs many projects concurrently; cleanup must only target project-spawned processes\b/i,
  /^- Process cleanup must be PID\/process-group scoped only\b/i,
  /^- ALWAYS ensure proper resource cleanup to avoid leaks and zombie processes\./i,
  /^Stabilize them\./i,
  /^- Continue working until there is no clear low-risk local next step\./i,
  /^- Add or update tests for changed behavior\b/i,
  /^Add or update tests for changed behavior\b/i,
  /^- Do not manually edit generated files\./i,
  /^- RTX should consume the highest-priority unresolved item\b/i,
  /^- Verify work before declaring completion\./i,
  /^Verify work before declaring completion\./i,
  /^Execute obvious, low-risk next steps within scope\.?$/i,
  /^- Do not end a turn with permission-seeking offers\b/i,
  /^Do not end a turn with permission-seeking offers\b/i,
  /^- Do not ask for permission for routine\b/i,
  /^Do not ask for permission for routine\b/i,
  /^If the obvious experiment path is stuck\b/i,
  /^is repo state clean and up to date with remote\??$/i,
  /^Now I need to run the full `?LOCAL-SHARED-[^`\s]+`?\b/i,
  /^The canonical MLX baseline smoke test passed\. Now I need to run the full\b/i,
  /^- Build an explicit list of the .*active MLX baseline\/control anchors.*$/i,
  /^- context cancellation \(respecting ctx\.Done\(\) in long operations\)/i,
  /\bThere is\s*\*\*no\*\* legitimate reason to skip work this turn\b/i,
  /^[-•]\s*[a-z0-9._-]+:\s+.+\bUse when\b/i,
  /^(?:[-•]\s*)?[a-z0-9]+(?:-[a-z0-9]+){1,}:\s+[A-Z]/i,
  /^(?:[-•]\s*)?[a-z0-9._-]+:\s+(?:Helps|Guides|Use when|Integration-research workflow)\b/i,
  /^(?:[-•]\s*)?[a-z0-9._-]+:\s+[A-Z][^.]{0,220}\.\s+(?:Use|Invoke|Guides|Helps|Trigger|Update documentation|Verify work)\b/i,
  /\bcreate-subagent:\s+Create custom subagents\b/i,
  /\b(?:Repo Execution Trust|Trust Boundary)\b/i,
  /\btrust file shape\b/i,
  /\ballow_project_commands\b/i,
  /\brepo-local executable settings\b/i,
  /\bmissing trust file means\b/i,
  /\bFocus on\b.+\bReport:\s*1\)/i,
  /^(?:Audit|Inspect|Post-remediation audit of)\b.+\bFocus\b/i,
];

const unsafePreviewPatterns = [
  /(?:^|\s)~?\/?\.ssh\//i,
  /(?:^|\s)~\/\.ssh(?:\s|$|[.)!,:;])/i,
  /\bssh[- ]?key(?:s)?\b/i,
  /\b(?:private|public)\s+key\b/i,
  /\bprivate keys\b/i,
  /\b(?:authorized_keys|known_hosts)\b/i,
  /\bno such identity\b/i,
  /\bpermission denied\s*\(?(?:publickey|keyboard-interactive)\)?/i,
  /\b(?:id_(?:ed25519|rsa|ecdsa)|ed25519|rsa)\b/i,
  /\b(passphrase|password|api[_ -]?key|access[_ -]?token|secret)\b/i,
  /\[redacted-(?:ssh|identity|token|secret|email|path|ip|sensitive|unsafe|abusive)[^\]]*\]/i,
  /\brestore\s+~\/\.ssh\b/i,
  /\brestore\b.+\b(?:ssh|key state|key material|encrypted artifacts)\b/i,
  /\bplaintext private keys?\b/i,
  /\bdecryptable\b.+\bprivate keys?\b/i,
  /\brestor(?:e|ing)\b.+\bprivate keys?\b/i,
];

const profanityPatterns = [
  /\bfuck(?:ing|ed|er|ers)?\b/gi,
  /\bshit(?:ty|ted|ting)?\b/gi,
  /\bbitch(?:es|ing)?\b/gi,
  /\basshole\b/gi,
  /\bdamn\b/gi,
  /\bdumb\b/gi,
  /\bstupid\b/gi,
  /\bidiot(?:ic)?\b/gi,
  /\bmoron(?:ic)?\b/gi,
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9#<])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function stripQuotedPromptBlock(text: string): string {
  return text.replace(
    /^\s*(?:This|The)\s+prompt:\s*(?:"""|```)[\s\S]*?(?:"""|```)\s*/i,
    "",
  );
}

function extractStructuredPreviewCandidates(message: string): string[] {
  const normalized = stripQuotedPromptBlock(
    message.replace(/\r\n?/g, "\n").trim(),
  );
  if (normalized.length === 0) {
    return [];
  }

  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const candidates: string[] = [];

  for (const block of blocks) {
    const inlineBlock = normalizeWhitespace(block);
    if (inlineBlock.length === 0) {
      continue;
    }

    candidates.push(inlineBlock);

    const blockLines = block
      .split("\n")
      .map((line) => normalizeWhitespace(line))
      .filter((line) => line.length > 0);
    for (const line of blockLines) {
      candidates.push(line);
    }

    for (const match of block.matchAll(
      /"message"\s*:\s*"((?:[^"\\]|\\.)+)"/g,
    )) {
      const [, rawMessage] = match;
      if (!rawMessage) {
        continue;
      }
      candidates.push(
        rawMessage.replace(/\\"/g, '"').replace(/\\n/g, " ").trim(),
      );
    }

    const sentences = splitIntoSentences(inlineBlock);
    for (const sentence of sentences) {
      candidates.push(sentence);
    }

    const inlineBulletSegments = inlineBlock
      .split(/\s+-\s+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (inlineBulletSegments.length > 1) {
      for (const segment of inlineBulletSegments) {
        candidates.push(segment);
      }
    }

    const inlineNumberedSegments = inlineBlock
      .split(/\s+(?=\d+[.)]\s+)/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (inlineNumberedSegments.length > 1) {
      for (const segment of inlineNumberedSegments) {
        candidates.push(segment);
      }
    }

    for (let index = 0; index < sentences.length - 1; index += 1) {
      const first = sentences[index];
      const second = sentences[index + 1];
      if (!first || !second) {
        continue;
      }
      candidates.push(`${first} ${second}`);
    }
  }

  candidates.push(normalizeWhitespace(normalized));
  return [...new Set(candidates)];
}

function redactEmailAddresses(text: string): string {
  return text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[redacted-email]",
  );
}

function redactUrls(text: string): string {
  return text.replace(/\bhttps?:\/\/\S+\b/gi, "[redacted-url]");
}

function redactIpAddresses(text: string): string {
  return text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]");
}

function redactAbsolutePaths(text: string): string {
  return text
    .replace(
      /(?:^|[\s("'`])(?:\/(?:Users|home|var|tmp|private|opt|etc|Volumes|mnt|workspace|workspaces)[^\s"'`)]+)+/g,
      (match) => {
        const prefixMatch = match.match(/^[\s("'`]?/);
        const prefix = prefixMatch?.[0] ?? "";
        return `${prefix}[redacted-path]`;
      },
    )
    .replace(/\b[A-Z]:\\(?:[^\\\s]+\\)+[^\\\s]+\b/g, "[redacted-path]");
}

function redactSshAndIdentityDetails(text: string): string {
  return text
    .replace(
      /\bno such identity:\s*(?:~?\/[^\s"'`]+|[^\s"'`]+)\b/gi,
      "[redacted-ssh-identity]",
    )
    .replace(
      /\bpermission denied\s*\(?(?:publickey|keyboard-interactive)\)?/gi,
      "[redacted-ssh-auth]",
    )
    .replace(/\b(?:authorized_keys|known_hosts)\b/gi, "[redacted-ssh-file]")
    .replace(
      /\b(?:[\w.-]+_)?id_(?:ed25519|rsa|ecdsa)\b/gi,
      "[redacted-ssh-key]",
    )
    .replace(
      /\b(?:ssh[- ]?key(?:s)?|private key|public key)\b/gi,
      "[redacted-ssh-key-reference]",
    )
    .replace(/(?:^|\s)~\/\.ssh(?=$|[\s"',`.)!;:])/gi, (match) =>
      match.replace(/~\/\.ssh/i, "[redacted-ssh-path]"),
    )
    .replace(/(?:^|\s)~?\/?\.ssh\/[^\s"'`)]*/gi, (match) =>
      match.replace(/~?\/?\.ssh\/[^\s"'`)]*/i, "[redacted-ssh-path]"),
    );
}

function redactProfanity(text: string): string {
  let redacted = text;
  for (const pattern of profanityPatterns) {
    redacted = redacted.replace(pattern, "[redacted-abusive-language]");
  }
  return redacted;
}

function redactTokenLikeValues(text: string): string {
  return text
    .replace(
      /\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_-]{16,}\b/g,
      "[redacted-token]",
    )
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[redacted-token]")
    .replace(
      /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
      "Bearer [redacted-token]",
    )
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, "[redacted-secret]");
}

function collapseSensitiveMarkers(text: string): string {
  return text
    .replace(
      /(?:\[redacted-[^\]]+\][\s,;:.!?'"`()/-]*){2,}/g,
      "[redacted-sensitive-content] ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

function previewSignalScore(preview: string): number {
  let score = 0;

  if (isLowSignalPreview(preview)) {
    score -= 20;
  } else {
    score += 10;
  }

  if (/\b(i|we|my|our|me|us)\b/i.test(preview)) {
    score += 4;
  }

  if (
    /\b(catastrophic|policy drift|actual issue|problem signal|correct access rights|why does it seem like things are broken|cleanup this mess)\b/i.test(
      preview,
    )
  ) {
    score += 6;
  }

  if (
    /\b(please|still|stuck|broken|broke|fail|failing|failure|regression|verify|verification|wrong|issue|problem|feedback|complaint|blocked|need|want|bug|bugs|cleanup|trust|risk|risks|leak|leaks|drift|severity|finding|findings)\b/i.test(
      preview,
    )
  ) {
    score += 4;
  }

  if (/\?|!/.test(preview)) {
    score += 1;
  }

  const words = wordCount(preview);
  if (words >= 6) {
    score += 2;
  }
  if (words >= 14) {
    score += 1;
  }

  if (/<\/?[a-z_:-]+>/i.test(preview)) {
    score -= 4;
  }

  if (/```|`{2,}|\{".+?:.+?"\}/.test(preview)) {
    score -= 4;
  }

  if (/^[#<>{}[\]A-Z0-9_/:. -]+$/i.test(preview)) {
    score -= 2;
  }

  if (/^\d+[.)]\s+/.test(preview)) {
    score -= 4;
  }

  const instructionMarkupCount =
    preview.match(/(?:^|\s)(?:##+|group\s+\d+:|\$[a-z0-9._-]+)/gi)?.length ?? 0;
  if (instructionMarkupCount >= 2) {
    score -= 4;
  }

  if (
    /\bSKILL\.md\b|~\/\.agents\/skills\/|~\/\.codex\/skills\//i.test(preview)
  ) {
    score -= 6;
  }

  if (
    /\b(what changed|how to verify|what'?s next|Cursor rules|file-specific patterns|coding standards|summary)\b/i.test(
      preview,
    )
  ) {
    score -= 6;
  }

  if (
    /^(?:User request:|Deliverables expected in this repo:)\b/i.test(preview)
  ) {
    score -= 8;
  }

  if (
    /^(?:When asked about:|When listing skills,\s*output approximately as follows\b)/i.test(
      preview,
    )
  ) {
    score -= 10;
  }

  if (/^Pro\s*-\s*(?:Light|Standard|Extended|Heavy)\b/i.test(preview)) {
    score -= 8;
  }

  if (/artifact upload/i.test(preview)) {
    score -= 5;
  }

  if (/\b1\.\s+.+\b2\.\s+/i.test(preview)) {
    score -= 4;
  }

  const inlineNumberedMarkerCount = preview.match(/\s\d+[.)]\s+/g)?.length ?? 0;
  if (inlineNumberedMarkerCount >= 2) {
    score -= 8;
  } else if (inlineNumberedMarkerCount === 1) {
    score -= 4;
  }

  if (/^That being said,\s*/i.test(preview)) {
    score -= 2;
  }

  if (
    /\b(?:Audit|Inspect|Post-remediation audit|Look through the codebase|Focus only on|Focus on|Report:\s*1\)|Identify architectural debt)\b/i.test(
      preview,
    )
  ) {
    score -= 6;
  }

  if (isQuotedPromptComplaintPreview(preview)) {
    score -= 12;
  }

  if (
    /\b(?:Repo Execution Trust|Trust Boundary|trust file shape|allow_project_commands|repo-local executable settings|create-subagent:\s+Create custom subagents)\b/i.test(
      preview,
    )
  ) {
    score -= 10;
  }

  if (isUnsafePreview(preview)) {
    score -= 10;
  }

  if (/\[redacted-sensitive-content\]/i.test(preview)) {
    score -= 6;
  }

  if (/\[redacted-abusive-language\]/i.test(preview)) {
    score -= 4;
  }

  return score;
}

/**
 * Checks if a preview is considered low-signal (boilerplate content).
 *
 * Low-signal patterns include AGENTS.md instructions, orchestration wrappers,
 * forked session markers, and other non-human-authored content.
 *
 * @param preview - The preview text to check
 * @returns True if the preview matches low-signal patterns
 *
 * @example
 * ```typescript
 * isLowSignalPreview("# AGENTS.md instructions"); // true
 * isLowSignalPreview("The build is failing"); // false
 * ```
 */
export function isLowSignalPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  const bulletItemCount = normalized.match(/(?:^|\s)[-•]\s+/g)?.length ?? 0;
  const codeSpanCount = normalized.match(/`[^`]+`/g)?.length ?? 0;
  const emphasizedHeadingCount =
    normalized.match(/\*\*[A-Z][^*]{1,80}:\*\*/g)?.length ?? 0;

  return (
    lowSignalPatterns.some((pattern) => pattern.test(normalized)) ||
    bulletItemCount >= 3 ||
    codeSpanCount >= 4 ||
    (emphasizedHeadingCount >= 1 && bulletItemCount >= 2)
  );
}

export function isUnsafePreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return unsafePreviewPatterns.some((pattern) => pattern.test(normalized));
}

function isInstructionalSpecPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return (
    /^Example: When (?:building|designing|creating|authoring) a `?[a-z0-9_-]+`? skill\b/i.test(
      normalized,
    ) ||
    /^If the harness uses `?(?:CLAUDE|GEMINI)\.md`?/i.test(normalized) ||
    /^To create an effective skill, clearly understand concrete examples/i.test(
      normalized,
    ) ||
    /^\*\*Target Objective:\*\*/i.test(normalized) ||
    /^Roadmap items must be chunky, implementation-oriented workstreams\b/i.test(
      normalized,
    ) ||
    /^The skills at \[redacted-url\] are preinstalled\b/i.test(normalized) ||
    /^If you start [A-Za-z0-9_-]+ dev servers, automation\/test processes\b/i.test(
      normalized,
    ) ||
    /^\*\*Note\*\*: Scripts may still need to be read by Codex\b/i.test(
      normalized,
    ) ||
    /^Provide prioritized, actionable findings\.?$/i.test(normalized) ||
    /^The phrase "eval" here means \*\*contract verification\*\*/i.test(
      normalized,
    ) ||
    /^Should continuity be primarily local-to-device\/session\b/i.test(
      normalized,
    ) ||
    /^Execute obvious, low-risk next steps within scope\.?$/i.test(
      normalized,
    ) ||
    /^Add or update tests for changed behavior\b/i.test(normalized)
  );
}

function isSocialCheckinPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return (
    /^nudge:\s*['"]/i.test(normalized) ||
    /wanted to (?:check in|circle back)\b/i.test(normalized) ||
    /do you have a few minutes later today\??/i.test(normalized) ||
    /while (?:this was still fresh|recovery is still very present)/i.test(
      normalized,
    ) ||
    /^Hey [A-Z][a-z]+/i.test(normalized)
  );
}

function isManifestoStylePreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return /^\d*\.?\s*I trust the system because\b/i.test(normalized);
}

function isQuotedPromptComplaintPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return (
    ((/^(?:do not|write|mention|include|keep|avoid|use|prefer)\b/i.test(
      normalized,
    ) &&
      /["”]\s+(?:is|this|that)\b/i.test(normalized)) ||
      /^(?:is a wildly disingenuous|unless i am missing something this mandate)\b/i.test(
        normalized,
      )) &&
    /\b(?:mandate|requirement|disingenuous|brittle|fragile|contrived|test)\b/i.test(
      normalized,
    )
  );
}

function isAssistantProgressPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return (
    /^(?:now\s+)?let me check\b/i.test(normalized) ||
    /^now let me\b/i.test(normalized) ||
    /^i(?:['’]m| am) rerunning\b/i.test(normalized) ||
    /^i(?:['’]m| am) patching\b/i.test(normalized) ||
    /^i(?:['’]m| am) checking\b/i.test(normalized)
  );
}

export function isPublicOperatorPreview(
  preview: string,
  options?: { source?: "user" | "assistant"; purpose?: "title" | "evidence" },
): boolean {
  const normalized = normalizeWhitespace(preview);
  if (normalized.length === 0) {
    return false;
  }

  if (isUnsafePreview(normalized) || isLowSignalPreview(normalized)) {
    return false;
  }

  if (
    isInstructionalSpecPreview(normalized) ||
    isSocialCheckinPreview(normalized) ||
    isManifestoStylePreview(normalized) ||
    isQuotedPromptComplaintPreview(normalized)
  ) {
    return false;
  }

  if (options?.source === "assistant" && options?.purpose === "title") {
    if (
      /^(?:i(?:['’]ve| have)|we(?:['’]ve| have))\s+(?:narrowed|confirmed|found|traced|reviewed|checked)\b/i.test(
        normalized,
      ) ||
      isAssistantProgressPreview(normalized)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes message text for safe, compact display.
 *
 * Performs the following transformations:
 * 1. Normalizes whitespace (collapses multiple spaces/newlines)
 * 2. Redacts email addresses
 * 3. Redacts home directory paths (replaces with ~)
 * 4. Truncates to maxLength with ellipsis
 *
 * @param text - The raw message text to sanitize
 * @param options - Options for home directory redaction and max length
 * @returns Sanitized, truncated text safe for display
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeMessageText("Hello world!!!", { maxLength: 8 });
 * console.log(sanitized); // "Hello..."
 * ```
 */
export function sanitizeMessageText(
  text: string,
  options: Pick<PreviewOptions, "homeDirectory" | "maxLength">,
): string {
  const normalized = normalizeWhitespace(text);
  const redacted = collapseSensitiveMarkers(
    redactProfanity(
      redactTokenLikeValues(
        redactSshAndIdentityDetails(
          redactAbsolutePaths(
            redactIpAddresses(
              redactUrls(
                redactEmailAddresses(
                  redactPath(normalized, options.homeDirectory),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  if (redacted.length <= options.maxLength) {
    return redacted;
  }

  const sliceLength = Math.max(
    0,
    options.maxLength - SANITIZATION.ELLIPSIS_LENGTH,
  );
  return `${redacted.slice(0, sliceLength).trimEnd()}...`;
}

/**
 * Creates ranked, sanitized message previews from raw messages.
 *
 * Scores messages by signal quality (preferring human-authored content over
 * boilerplate), deduplicates, and returns the top N unique previews.
 *
 * Signal scoring criteria:
 * - Penalty for low-signal patterns (orchestration, instructions)
 * - Bonus for first-person language ("I", "my", "we")
 * - Bonus for feedback keywords ("please", "stuck", "broken", "fail")
 * - Bonus for punctuation indicating human speech (? or !)
 * - Bonus for reasonable length (6-14 words)
 *
 * @param messages - Array of raw message strings
 * @param options - Preview options for sanitization and limits
 * @returns Array of sanitized preview strings, ranked by signal quality
 *
 * @example
 * ```typescript
 * const previews = createMessagePreviews(
 *   ["Thanks!", "AGENTS.md instructions", "The build is failing"],
 *   { maxLength: 100, maxItems: 2 }
 * );
 * // Returns ["The build is failing", "Thanks!"] (ranked by signal)
 * ```
 */
export function createMessagePreviews(
  messages: readonly string[],
  options: PreviewOptions,
): string[] {
  return selectBestPreviews(
    messages.flatMap((message) =>
      extractStructuredPreviewCandidates(message).map((candidate) =>
        sanitizeMessageText(candidate, options),
      ),
    ),
    options.maxItems,
  );
}

function normalizePreviewDedupKey(preview: string): string {
  return preview
    .trim()
    .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)+/, "")
    .replace(/\s+/g, " ")
    .replace(/[.…]+$/, "")
    .trim()
    .toLowerCase();
}

export function selectBestPreviews(
  previews: readonly string[],
  maxItems: number,
): string[] {
  const unique = new Map<
    string,
    {
      preview: string;
      index: number;
      score: number;
    }
  >();

  for (const [index, preview] of previews.entries()) {
    if (preview.length === 0) {
      continue;
    }

    const dedupeKey = normalizePreviewDedupKey(preview);
    const score = previewSignalScore(preview);
    const existing = unique.get(dedupeKey);
    if (
      existing &&
      (existing.score > score ||
        (existing.score === score && existing.index <= index))
    ) {
      continue;
    }

    unique.set(dedupeKey, {
      preview,
      index,
      score,
    });
  }

  return [...unique.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.index - right.index ||
        left.preview.localeCompare(right.preview),
    )
    .slice(0, maxItems)
    .map((entry) => entry.preview);
}
