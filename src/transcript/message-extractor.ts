/**
 * Purpose: Message content extraction utilities for transcript parsing.
 * Entrypoint: Used by event-router to extract message text from payloads.
 * Notes: Handles both user and assistant message formats.
 */

import { asRecord, asString, getValue } from "./type-guards.js";
import type { ParserContext, SourceRef } from "./types.js";

/**
 * Extracts text content from a message payload.
 * Handles array of content items with text parts.
 */
export function extractMessageText(
  payload: Record<string, unknown>,
): string | undefined {
  const content = getValue(payload, "content");
  if (!Array.isArray(content)) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const item of content) {
    const record = asRecord(item);
    const text = record ? asString(getValue(record, "text")) : undefined;
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : undefined;
}

/**
 * Handles message response items by extracting text content based on role.
 */
export function handleMessageResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const text = extractMessageText(payload);
  if (!text) {
    return;
  }

  const role = asString(getValue(payload, "role"));

  if (role === "user") {
    context.currentTurn.userMessages.push(text);
  } else if (role === "assistant") {
    context.currentTurn.assistantMessages.push(text);
  }

  context.currentTurn.sourceRefs.push(sourceRef);
}
