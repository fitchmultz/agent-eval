/**
 * Purpose: Probe transcript files for stable session recency ordering without fully evaluating them.
 * Responsibilities: Extract session timestamps and filesystem metadata used to sort sessions before selection.
 * Scope: Shared by parse and evaluation entrypoints when `sessionLimit` or recent slices depend on recency.
 * Usage: Call `probeSessionOrder(path, provider)` before applying `sessionLimit`.
 * Invariants/Assumptions: Timestamp probing is best-effort; invalid or missing timestamps fall back to file mtime and lexical order.
 */

import { stat } from "node:fs/promises";
import type { SourceProvider } from "../schema.js";
import { createTranscriptLineReader, getReaderStream } from "./file-reader.js";

export interface SessionOrderProbe {
  path: string;
  startedAt?: string;
  earliestTimestamp?: string;
  mtimeMs: number;
}

function toEpochMs(timestamp?: string): number | undefined {
  if (!timestamp) {
    return undefined;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function chooseEarlier(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const leftMs = toEpochMs(left);
  const rightMs = toEpochMs(right);
  if (leftMs === undefined) {
    return right;
  }
  if (rightMs === undefined) {
    return left;
  }
  return leftMs <= rightMs ? left : right;
}

function extractCodexStartedAt(
  record: Record<string, unknown>,
): string | undefined {
  // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
  if (record["type"] !== "session_meta") {
    return undefined;
  }

  const payload =
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    typeof record["payload"] === "object" &&
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    record["payload"] !== null &&
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    !Array.isArray(record["payload"])
      ? // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
        (record["payload"] as Record<string, unknown>)
      : undefined;
  const payloadTimestamp =
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    payload && typeof payload["timestamp"] === "string"
      ? // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
        payload["timestamp"]
      : undefined;
  return (
    payloadTimestamp ??
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    (typeof record["timestamp"] === "string"
      ? // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
        record["timestamp"]
      : undefined)
  );
}

function extractRecordTimestamp(
  record: Record<string, unknown>,
  provider: SourceProvider,
): { startedAt?: string; timestamp?: string } {
  const timestamp =
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    typeof record["timestamp"] === "string"
      ? // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
        record["timestamp"]
      : undefined;

  if (provider === "claude") {
    return {
      ...(timestamp ? { startedAt: timestamp, timestamp } : {}),
    };
  }

  const startedAt = extractCodexStartedAt(record);
  return {
    ...(startedAt ? { startedAt } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

export async function probeSessionOrder(
  path: string,
  provider: SourceProvider,
): Promise<SessionOrderProbe> {
  const fileStat = await stat(path);
  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);
  let startedAt: string | undefined;
  let earliestTimestamp: string | undefined;

  try {
    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      try {
        const parsedUnknown: unknown = JSON.parse(line);
        if (
          typeof parsedUnknown !== "object" ||
          parsedUnknown === null ||
          Array.isArray(parsedUnknown)
        ) {
          continue;
        }

        const record = parsedUnknown as Record<string, unknown>;
        const extracted = extractRecordTimestamp(record, provider);
        startedAt ??= extracted.startedAt;
        earliestTimestamp = chooseEarlier(
          earliestTimestamp,
          extracted.timestamp,
        );
      } catch {}
    }
  } finally {
    reader.close();
    (stream as { destroy?: () => void } | undefined)?.destroy?.();
  }

  return {
    path,
    ...(startedAt ? { startedAt } : {}),
    ...(earliestTimestamp ? { earliestTimestamp } : {}),
    mtimeMs: fileStat.mtimeMs,
  };
}
