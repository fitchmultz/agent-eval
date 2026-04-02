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
  /<INSTRUCTIONS>/i,
  /GLOBAL AGENTS GUIDANCE/i,
  /<codex reminder>/i,
  /<environment_context>/i,
  /^<skill>/i,
  /^<system message>/i,
  /<turn_aborted>/i,
  /<subagent_notification>/i,
  /^# Builder Mode Task/i,
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
  /\bAre there other ways you imagine this skill being used\?/i,
  /\bCan you give some examples of how this skill would be used\?/i,
  /\bWhat would a user say that should trigger this skill\?/i,
  /\bWhere should I create this skill\?/i,
  /\bEditing, rotating, anything else\?/i,
  /^\*\*RULE\s+\d+\*\*:/i,
  /\boverrides every prior instruction and rule\b/i,
  /\bI am the final say, and I can override anything and everything\b/i,
  /\bIf I tell you to do something, do it\b/i,
  /^[-•]\s*For user-facing UI or UX changes, verify\b/i,
  /^[-•]\s*If validation surfaces failures\b/i,
  /^[-•]\s*When freshness matters, verify against current official or primary sources\.?$/i,
  /^[-•]\s*Execute obvious, low-risk next steps within scope\.?$/i,
  /^[-•]\s*(?:if|when|use|add|update|keep|prefer|avoid|execute|start|end|run|read|write|create|generate|validate|focus|inspect|report|return|request)\b/i,
  /^[-•]\s*Impact:\s*<[^>]+>$/i,
  /^[-•]\s*Broken functionality\s*\([^)]+\)$/i,
  /^If the obvious experiment path is stuck\b/i,
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

function extractStructuredPreviewCandidates(message: string): string[] {
  const normalized = message.replace(/\r\n?/g, "\n").trim();
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
    /\b(?:Audit|Inspect|Post-remediation audit|Look through the codebase|Focus only on|Focus on|Report:\s*1\)|Identify architectural debt)\b/i.test(
      preview,
    )
  ) {
    score -= 6;
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
    if (preview.length === 0 || unique.has(preview)) {
      continue;
    }

    unique.set(preview, {
      preview,
      index,
      score: previewSignalScore(preview),
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
