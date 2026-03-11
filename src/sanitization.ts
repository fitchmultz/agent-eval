/**
 * Purpose: Redacts, ranks, and truncates free-form transcript text before it is emitted into evaluator artifacts.
 * Entrypoint: `createMessagePreviews()` is used by the evaluator and report pipeline when generating outputs.
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
  /^# Parallel Integration/i,
  /^# Deep Investigation Mode/i,
  /<INSTRUCTIONS>/i,
  /GLOBAL AGENTS GUIDANCE/i,
  /<codex reminder>/i,
  /<environment_context>/i,
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
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
    /\b(please|still|stuck|broken|broke|fail|failing|failure|regression|verify|verification|wrong|issue|problem|feedback|complaint|blocked|need|want)\b/i.test(
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

  if (/^[#<>{}[\]A-Z0-9_/:. -]+$/i.test(preview)) {
    score -= 2;
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
  return lowSignalPatterns.some((pattern) => pattern.test(normalized));
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
  const redacted = redactTokenLikeValues(
    redactAbsolutePaths(
      redactIpAddresses(
        redactUrls(
          redactEmailAddresses(redactPath(normalized, options.homeDirectory)),
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
  const unique = new Map<
    string,
    {
      preview: string;
      index: number;
      score: number;
    }
  >();

  for (const [index, message] of messages.entries()) {
    const preview = sanitizeMessageText(message, options);
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
    .slice(0, options.maxItems)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.preview);
}
