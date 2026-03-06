/**
 * Purpose: Redacts, ranks, and truncates free-form transcript text before it is emitted into evaluator artifacts.
 * Entrypoint: `createMessagePreviews()` is used by the evaluator and report pipeline when generating outputs.
 * Notes: v1 favors compact, public-safe previews and prioritizes human-authored signal over harness boilerplate.
 */
export interface PreviewOptions {
  homeDirectory?: string | undefined;
  maxLength: number;
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

function redactHomeDirectory(text: string, homeDirectory?: string): string {
  if (!homeDirectory || homeDirectory.length === 0) {
    return text;
  }

  return text.split(homeDirectory).join("~");
}

function redactEmailAddresses(text: string): string {
  return text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[redacted-email]",
  );
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

export function isLowSignalPreview(preview: string): boolean {
  const normalized = normalizeWhitespace(preview);
  return lowSignalPatterns.some((pattern) => pattern.test(normalized));
}

export function sanitizeMessageText(
  text: string,
  options: Pick<PreviewOptions, "homeDirectory" | "maxLength">,
): string {
  const normalized = normalizeWhitespace(text);
  const redacted = redactEmailAddresses(
    redactHomeDirectory(normalized, options.homeDirectory),
  );
  if (redacted.length <= options.maxLength) {
    return redacted;
  }

  const sliceLength = Math.max(0, options.maxLength - 3);
  return `${redacted.slice(0, sliceLength).trimEnd()}...`;
}

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
