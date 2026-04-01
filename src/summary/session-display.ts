/**
 * Purpose: Derive human-readable operator-facing session identity and context from transcript-visible metadata.
 * Responsibilities: Build session contexts from turns, shorten session ids, derive project/timestamp labels, and create humane display labels.
 * Scope: Shared by summary aggregation, ranking, and report rendering.
 * Usage: Call `collectSessionContexts(rawTurns)` and feed the resulting map into summary generation.
 * Invariants/Assumptions: Identity stays deterministic and transcript-derived; raw UUIDs remain secondary metadata only.
 */

import { basename, dirname } from "node:path";
import {
  isLowSignalPreview,
  isUnsafePreview,
  selectBestPreviews,
} from "../sanitization.js";
import type { RawTurnRecord, SourceRef } from "../schema.js";
import type { SessionContext } from "./types.js";

function uniqueSourceRefKey(sourceRef: SourceRef): string {
  return [
    sourceRef.provider,
    sourceRef.kind,
    sourceRef.path,
    sourceRef.line ?? "",
    sourceRef.table ?? "",
    sourceRef.rowId ?? "",
  ].join("::");
}

function chooseLeadPreview(previews: readonly string[]): string | undefined {
  const highSignal = previews.filter(
    (preview) => !isLowSignalPreview(preview) && !isUnsafePreview(preview),
  );
  if (highSignal.length > 0) {
    return selectBestPreviews(highSignal, 1)[0];
  }

  const safe = previews.filter((preview) => !isUnsafePreview(preview));
  if (safe.length > 0) {
    return selectBestPreviews(safe, 1)[0];
  }

  return previews[0];
}

function chooseEvidencePreviews(previews: readonly string[]): string[] {
  const highSignal = previews.filter(
    (preview) => !isLowSignalPreview(preview) && !isUnsafePreview(preview),
  );
  if (highSignal.length > 0) {
    return selectBestPreviews(highSignal, 3);
  }

  const safe = previews.filter((preview) => !isUnsafePreview(preview));
  if (safe.length > 0) {
    return selectBestPreviews(safe, 3);
  }

  return selectBestPreviews(previews, 3);
}

function stableEarliestTimestamp(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }

  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(currentTime) || Number.isNaN(candidateTime)) {
    return current.localeCompare(candidate) <= 0 ? current : candidate;
  }

  return candidateTime < currentTime ? candidate : current;
}

function truncateLabel(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function deriveSessionShortId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (normalized.length <= 12) {
    return normalized;
  }

  return normalized.slice(-8);
}

export function deriveSessionTimestampLabel(startedAt?: string): string {
  if (!startedAt) {
    return "time unknown";
  }

  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) {
    return truncateLabel(startedAt, 20);
  }

  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")}Z`;
}

function isMeaningfulProjectLabel(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized === ".") {
    return false;
  }

  if (
    normalized === "T" ||
    normalized === "tmp" ||
    normalized === "temp" ||
    normalized === "sessions" ||
    normalized === "projects" ||
    normalized === "agent" ||
    normalized.startsWith("-private-var-folders-")
  ) {
    return false;
  }

  if (/^\d+$/.test(normalized) || /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  if (normalized.endsWith(".jsonl")) {
    return false;
  }

  return true;
}

function derivePiProjectFromSourcePath(sourcePath: string): string | undefined {
  const parent = basename(dirname(sourcePath.replace(/\/$/, "")));
  const match = parent.match(/Projects-(.+?)--?$/);
  const candidate = match?.[1]?.replace(/--+$/, "");
  return candidate && isMeaningfulProjectLabel(candidate)
    ? candidate
    : undefined;
}

export function deriveSessionProjectLabel(
  cwd?: string,
  sourceRefs: readonly SourceRef[] = [],
): string {
  if (cwd) {
    const projectName = basename(cwd.replace(/\/$/, ""));
    if (isMeaningfulProjectLabel(projectName)) {
      return projectName;
    }
  }

  const sourcePath = sourceRefs[0]?.path;
  if (sourcePath?.includes("/.pi/agent/sessions/")) {
    const piProject = derivePiProjectFromSourcePath(sourcePath);
    if (piProject) {
      return piProject;
    }
  }

  const sourceParent = sourcePath
    ? basename(dirname(sourcePath.replace(/\/$/, "")))
    : undefined;
  if (sourceParent && isMeaningfulProjectLabel(sourceParent)) {
    return sourceParent;
  }

  return "project unknown";
}

export function deriveSessionDisplayLabel(
  sessionId: string,
  context?: SessionContext,
): string {
  const leadPreview = context?.leadUserPreview;
  if (leadPreview) {
    return truncateLabel(leadPreview, 88);
  }

  const projectLabel = deriveSessionProjectLabel(
    context?.cwd,
    context?.sourceRefs,
  );
  const timestampLabel = deriveSessionTimestampLabel(context?.startedAt);
  const shortId = deriveSessionShortId(sessionId);
  return `${projectLabel} · ${timestampLabel} · ${shortId}`;
}

export function collectSessionContexts(
  rawTurns: readonly RawTurnRecord[],
): Map<string, SessionContext> {
  const grouped = new Map<
    string,
    {
      startedAt?: string;
      cwd?: string;
      previews: string[];
      sourceRefs: Map<string, SourceRef>;
    }
  >();

  for (const turn of rawTurns) {
    const existing = grouped.get(turn.sessionId) ?? {
      previews: [],
      sourceRefs: new Map<string, SourceRef>(),
    };

    const earliestTimestamp = stableEarliestTimestamp(
      existing.startedAt,
      turn.startedAt,
    );
    if (earliestTimestamp) {
      existing.startedAt = earliestTimestamp;
    }
    if (!existing.cwd && turn.cwd) {
      existing.cwd = turn.cwd;
    }

    for (const preview of [
      ...turn.userMessagePreviews,
      ...turn.assistantMessagePreviews,
    ]) {
      if (preview.trim().length > 0) {
        existing.previews.push(preview);
      }
    }

    for (const sourceRef of turn.sourceRefs) {
      existing.sourceRefs.set(uniqueSourceRefKey(sourceRef), sourceRef);
    }

    grouped.set(turn.sessionId, existing);
  }

  return new Map(
    [...grouped.entries()].map(([sessionId, context]) => {
      const sourceRefs = [...context.sourceRefs.values()].slice(0, 5);
      const leadUserPreview = chooseLeadPreview(context.previews);
      const sessionContext: SessionContext = {
        sessionId,
        evidencePreviews: chooseEvidencePreviews(context.previews),
        sourceRefs,
      };
      if (context.startedAt) {
        sessionContext.startedAt = context.startedAt;
      }
      if (context.cwd) {
        sessionContext.cwd = context.cwd;
      }
      if (leadUserPreview) {
        sessionContext.leadUserPreview = leadUserPreview;
      }
      return [sessionId, sessionContext];
    }),
  );
}
