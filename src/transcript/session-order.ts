/**
 * Purpose: Probe transcript files for stable session recency ordering without fully evaluating them.
 * Responsibilities: Extract session timestamps and filesystem metadata used to sort and filter sessions before selection.
 * Scope: Shared by parse and evaluation entrypoints when `sessionLimit` or date slices depend on recency.
 * Usage: Call `probeSessionOrder(path, provider)` before applying date filters or `sessionLimit`.
 * Invariants/Assumptions: Timestamp probing is best-effort; invalid or missing timestamps fall back to file mtime and lexical order.
 */

import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { SourceProvider } from "../schema.js";
import { createTranscriptLineReader, getReaderStream } from "./file-reader.js";

export interface SessionOrderProbe {
  path: string;
  sessionId?: string;
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

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getRecordValue(
  record: Record<string, unknown> | undefined,
  key: string,
): unknown {
  return record?.[key];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractCodexStartedAt(
  record: Record<string, unknown>,
): string | undefined {
  if (getRecordValue(record, "type") !== "session_meta") {
    return undefined;
  }

  const payload = asRecord(getRecordValue(record, "payload"));
  return (
    asString(getRecordValue(payload, "timestamp")) ??
    asString(getRecordValue(record, "timestamp"))
  );
}

function extractCodexSessionId(
  record: Record<string, unknown>,
): string | undefined {
  if (getRecordValue(record, "type") !== "session_meta") {
    return undefined;
  }

  return asString(
    getRecordValue(asRecord(getRecordValue(record, "payload")), "id"),
  );
}

function extractPiStartedAt(
  record: Record<string, unknown>,
): string | undefined {
  if (getRecordValue(record, "type") !== "session") {
    return undefined;
  }

  return asString(getRecordValue(record, "timestamp"));
}

function extractPiSessionId(
  record: Record<string, unknown>,
): string | undefined {
  if (getRecordValue(record, "type") !== "session") {
    return undefined;
  }

  return asString(getRecordValue(record, "id"));
}

function extractRecordMetadata(
  record: Record<string, unknown>,
  provider: SourceProvider,
): { sessionId?: string; startedAt?: string; timestamp?: string } {
  const timestamp = asString(getRecordValue(record, "timestamp"));

  if (provider === "claude") {
    const sessionId = asString(getRecordValue(record, "sessionId"));
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(timestamp ? { startedAt: timestamp, timestamp } : {}),
    };
  }

  if (provider === "pi") {
    const startedAt = extractPiStartedAt(record);
    const sessionId = extractPiSessionId(record);
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(timestamp ? { timestamp } : {}),
    };
  }

  const startedAt = extractCodexStartedAt(record);
  const sessionId = extractCodexSessionId(record);
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

function toIsoTime(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value).toISOString();
}

async function probeOpencodeSessionOrder(
  path: string,
  mtimeMs: number,
): Promise<SessionOrderProbe> {
  try {
    const parsedUnknown: unknown = JSON.parse(await readFile(path, "utf8"));
    const record = asRecord(parsedUnknown);
    if (!record) {
      return { path, mtimeMs };
    }

    const sessionId = asString(getRecordValue(record, "id"));
    const time = asRecord(getRecordValue(record, "time"));
    const startedAt = toIsoTime(getRecordValue(time, "created"));
    const endedAt = toIsoTime(getRecordValue(time, "updated"));
    const earliestTimestamp = chooseEarlier(startedAt, endedAt);
    return {
      path,
      ...(sessionId ? { sessionId } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(earliestTimestamp ? { earliestTimestamp } : {}),
      mtimeMs,
    };
  } catch {
    return {
      path,
      sessionId: basename(path).replace(/\.json$/, ""),
      mtimeMs,
    };
  }
}

export function resolveProbeTimeValue(probe: SessionOrderProbe): number | null {
  return (
    toEpochMs(probe.startedAt) ??
    toEpochMs(probe.earliestTimestamp) ??
    (Number.isFinite(probe.mtimeMs) ? probe.mtimeMs : null)
  );
}

export function resolveProbeTimestamp(probe: SessionOrderProbe): string | null {
  const preferred = probe.startedAt ?? probe.earliestTimestamp;
  if (preferred && toEpochMs(preferred) !== undefined) {
    return preferred;
  }

  return null;
}

export function probeFallsInDateRange(
  probe: SessionOrderProbe,
  startDate?: string,
  endDate?: string,
): { matches: boolean; undated: boolean } {
  if (!startDate && !endDate) {
    return { matches: true, undated: false };
  }

  const resolvedTimestamp = resolveProbeTimestamp(probe);
  if (!resolvedTimestamp) {
    return { matches: false, undated: true };
  }

  const probeMs = Date.parse(resolvedTimestamp);
  if (Number.isNaN(probeMs)) {
    return { matches: false, undated: true };
  }

  const startMs = startDate ? Date.parse(startDate) : undefined;
  const endMs = endDate ? Date.parse(endDate) : undefined;
  if (startMs !== undefined && !Number.isNaN(startMs) && probeMs < startMs) {
    return { matches: false, undated: false };
  }
  if (endMs !== undefined && !Number.isNaN(endMs) && probeMs > endMs) {
    return { matches: false, undated: false };
  }

  return { matches: true, undated: false };
}

export async function probeSessionOrder(
  path: string,
  provider: SourceProvider,
): Promise<SessionOrderProbe> {
  const fileStat = await stat(path);
  if (provider === "opencode") {
    return probeOpencodeSessionOrder(path, fileStat.mtimeMs);
  }

  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);
  let sessionId: string | undefined;
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
        const extracted = extractRecordMetadata(record, provider);
        sessionId ??= extracted.sessionId;
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
    ...(sessionId ? { sessionId } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(earliestTimestamp ? { earliestTimestamp } : {}),
    mtimeMs: fileStat.mtimeMs,
  };
}
