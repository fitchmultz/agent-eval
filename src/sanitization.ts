/**
 * Purpose: Redacts and truncates free-form transcript text before it is emitted into evaluator artifacts.
 * Entrypoint: `createMessagePreviews()` is used by the evaluator and report pipeline when generating outputs.
 * Notes: v1 favors compact, public-safe previews over full transcript bodies in generated artifacts.
 */
export interface PreviewOptions {
  homeDirectory?: string | undefined;
  maxLength: number;
  maxItems: number;
}

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
  return messages
    .slice(0, options.maxItems)
    .map((message) => sanitizeMessageText(message, options));
}
