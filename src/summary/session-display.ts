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

interface PreviewCandidateGroup {
  previews: readonly string[];
  source: "user" | "assistant";
}

interface LeadPreviewSelection {
  preview?: string;
  source?: "user" | "assistant";
}

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

export function isCodeLikePreview(preview: string): boolean {
  const normalized = preview.trim();
  const symbolCount = normalized.match(/[{}()[\];=<>`]/g)?.length ?? 0;
  const hasCodeKeyword =
    /\b(function|const|let|var|class|interface|type|return|import|export|def|fn|struct|impl|SELECT|INSERT|UPDATE|DELETE)\b/.test(
      normalized,
    ) || /=>/.test(normalized);
  const looksLikeSignature =
    /^\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{?/.test(normalized) ||
    /^\s*(pub\s+)?fn\s+[A-Za-z_][\w]*\s*\(/.test(normalized);

  return (
    (symbolCount >= 4 && hasCodeKeyword) ||
    (symbolCount >= 6 && /[`{};]/.test(normalized)) ||
    looksLikeSignature
  );
}

export function isTruncatedPreview(preview: string): boolean {
  const normalized = preview.trimEnd();
  return normalized.endsWith("...") || normalized.endsWith("…");
}

function appendUniquePreviews(
  target: string[],
  previews: readonly string[],
  maxItems: number,
): void {
  for (const preview of selectBestPreviews(previews, maxItems)) {
    if (target.includes(preview)) {
      continue;
    }
    target.push(preview);
    if (target.length >= maxItems) {
      return;
    }
  }
}

function chooseLeadPreview(
  userPreviews: readonly string[],
  assistantPreviews: readonly string[],
): LeadPreviewSelection {
  const groups: PreviewCandidateGroup[] = [
    {
      previews: userPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview),
      ),
      source: "user",
    },
    {
      previews: userPreviews.filter(
        (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
      ),
      source: "user",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview),
      ),
      source: "assistant",
    },
    {
      previews: assistantPreviews.filter(
        (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
      ),
      source: "assistant",
    },
    {
      previews: userPreviews.filter((preview) => !isUnsafePreview(preview)),
      source: "user",
    },
    {
      previews: assistantPreviews.filter(
        (preview) => !isUnsafePreview(preview),
      ),
      source: "assistant",
    },
    { previews: userPreviews, source: "user" },
    { previews: assistantPreviews, source: "assistant" },
  ];

  for (const group of groups) {
    const preview = selectBestPreviews(group.previews, 1)[0];
    if (preview) {
      return { preview, source: group.source };
    }
  }

  return {};
}

function chooseEvidencePreviews(
  userPreviews: readonly string[],
  assistantPreviews: readonly string[],
): string[] {
  const selected: string[] = [];
  const groups = [
    userPreviews.filter(
      (preview) =>
        !isLowSignalPreview(preview) &&
        !isUnsafePreview(preview) &&
        !isCodeLikePreview(preview),
    ),
    userPreviews.filter(
      (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
    ),
    assistantPreviews.filter(
      (preview) =>
        !isLowSignalPreview(preview) &&
        !isUnsafePreview(preview) &&
        !isCodeLikePreview(preview),
    ),
    assistantPreviews.filter(
      (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
    ),
    userPreviews.filter((preview) => !isUnsafePreview(preview)),
    assistantPreviews.filter((preview) => !isUnsafePreview(preview)),
    userPreviews,
    assistantPreviews,
  ];

  for (const group of groups) {
    appendUniquePreviews(selected, group, 3);
    if (selected.length >= 3) {
      return selected;
    }
  }

  return selected;
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
  const leadPreview = context?.leadPreview;
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
      userPreviews: string[];
      assistantPreviews: string[];
      sourceRefs: Map<string, SourceRef>;
    }
  >();

  for (const turn of rawTurns) {
    const existing = grouped.get(turn.sessionId) ?? {
      userPreviews: [],
      assistantPreviews: [],
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

    for (const preview of turn.userMessagePreviews) {
      if (preview.trim().length > 0) {
        existing.userPreviews.push(preview);
      }
    }

    for (const preview of turn.assistantMessagePreviews) {
      if (preview.trim().length > 0) {
        existing.assistantPreviews.push(preview);
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
      const leadPreview = chooseLeadPreview(
        context.userPreviews,
        context.assistantPreviews,
      );
      const sessionContext: SessionContext = {
        sessionId,
        evidencePreviews: chooseEvidencePreviews(
          context.userPreviews,
          context.assistantPreviews,
        ),
        sourceRefs,
      };
      if (context.startedAt) {
        sessionContext.startedAt = context.startedAt;
      }
      if (context.cwd) {
        sessionContext.cwd = context.cwd;
      }
      if (leadPreview.preview) {
        sessionContext.leadPreview = leadPreview.preview;
        if (leadPreview.source) {
          sessionContext.leadPreviewSource = leadPreview.source;
        }
        sessionContext.leadPreviewIsCodeLike = isCodeLikePreview(
          leadPreview.preview,
        );
      }
      return [sessionId, sessionContext];
    }),
  );
}
