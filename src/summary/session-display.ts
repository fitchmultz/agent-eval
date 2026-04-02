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
import type {
  EvidenceIssue,
  EvidenceSource,
  RawTurnRecord,
  SourceRef,
  SummaryConfidence,
} from "../schema.js";
import type { SessionContext } from "./types.js";

interface PreviewCandidateGroup {
  previews: readonly string[];
  source: "user" | "assistant";
  confidence: SummaryConfidence;
}

interface LeadPreviewSelection {
  preview?: string;
  source?: "user" | "assistant";
  confidence?: SummaryConfidence;
}

interface EvidencePreviewSelection {
  previews: string[];
  source: EvidenceSource;
  confidence: SummaryConfidence;
  issues: EvidenceIssue[];
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
  const looksLikeRegexLiteral = /^\s*\/.+\/[a-z]*,?\s*$/.test(normalized);

  return (
    (symbolCount >= 4 && hasCodeKeyword) ||
    (symbolCount >= 6 && /[`{};]/.test(normalized)) ||
    looksLikeSignature ||
    looksLikeRegexLiteral
  );
}

export function isTruncatedPreview(preview: string): boolean {
  const normalized = preview.trimEnd();
  return normalized.endsWith("...") || normalized.endsWith("…");
}

function appendUniquePreviewEntries(
  target: Array<{ preview: string; source: "user" | "assistant" }>,
  previews: readonly string[],
  source: "user" | "assistant",
  maxItems: number,
): void {
  for (const preview of selectBestPreviews(previews, maxItems)) {
    if (target.some((entry) => entry.preview === preview)) {
      continue;
    }
    target.push({ preview, source });
    if (target.length >= maxItems) {
      return;
    }
  }
}

function isWeakLeadPreview(preview: string): boolean {
  return (
    /^(?:sounds good|okay|ok|alright|all right)\b/i.test(preview) ||
    /^(?:so,?\s+)?i(?:['’]m| am) going to\b/i.test(preview) ||
    /^(?:so,?\s+)?let me\b/i.test(preview) ||
    /^i(?:['’]m| am)\s+(?:checking|reading|reviewing|inspecting|looking|trying|focusing)\b/i.test(
      preview,
    ) ||
    /^there(?:['’]s| is) one more important thing to verify before\b/i.test(
      preview,
    ) ||
    /^also,?\s+i need to consider\b/i.test(preview) ||
    /^this way,?\s+i can\b/i.test(preview) ||
    /^the helper scripts are present\b/i.test(preview) ||
    /^stabilize them\./i.test(preview) ||
    /^no additional runs at this time please\b/i.test(preview) ||
    /^no docs\/report\. just fix the code\b/i.test(preview) ||
    /^why:\s/i.test(preview)
  );
}

function hasUserLeadSignalPreview(preview: string): boolean {
  return /\b(please|help me|can you|could you|would you|i need|i want|i just|we need|we want|bug|issue|problem|broken|broke|failing|failure|regression|error|wrong|confusing|stuck|fix|remove|replace)\b/i.test(
    preview,
  );
}

function hasAssistantLeadSignalPreview(preview: string): boolean {
  return /\b(bug|issue|problem|broken|broke|failing|failure|regression|error|wrong|confusing|stuck|fix|fixed|remove|replace|verify|verified|root cause|user-visible)\b/i.test(
    preview,
  );
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
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview) &&
          hasUserLeadSignalPreview(preview),
      ),
      source: "user",
      confidence: "strong",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview) &&
          hasAssistantLeadSignalPreview(preview),
      ),
      source: "assistant",
      confidence: "medium",
    },
  ];

  for (const group of groups) {
    const preview = selectBestPreviews(group.previews, 1)[0];
    if (preview) {
      return { preview, source: group.source, confidence: group.confidence };
    }
  }

  return {};
}

function chooseEvidencePreviews(
  userPreviews: readonly string[],
  assistantPreviews: readonly string[],
): EvidencePreviewSelection {
  const selected: Array<{ preview: string; source: "user" | "assistant" }> = [];
  const groups: PreviewCandidateGroup[] = [
    {
      previews: userPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          hasUserLeadSignalPreview(preview),
      ),
      source: "user",
      confidence: "strong",
    },
    {
      previews: userPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview),
      ),
      source: "user",
      confidence: "medium",
    },
    {
      previews: userPreviews.filter(
        (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
      ),
      source: "user",
      confidence: "weak",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          hasAssistantLeadSignalPreview(preview),
      ),
      source: "assistant",
      confidence: "medium",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          !isLowSignalPreview(preview) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview),
      ),
      source: "assistant",
      confidence: "weak",
    },
    {
      previews: assistantPreviews.filter(
        (preview) => !isUnsafePreview(preview) && !isCodeLikePreview(preview),
      ),
      source: "assistant",
      confidence: "weak",
    },
    {
      previews: userPreviews.filter((preview) => !isUnsafePreview(preview)),
      source: "user",
      confidence: "weak",
    },
    {
      previews: assistantPreviews.filter(
        (preview) => !isUnsafePreview(preview),
      ),
      source: "assistant",
      confidence: "weak",
    },
    { previews: userPreviews, source: "user", confidence: "weak" },
    { previews: assistantPreviews, source: "assistant", confidence: "weak" },
  ];

  let evidenceConfidence: SummaryConfidence = "weak";
  for (const group of groups) {
    appendUniquePreviewEntries(selected, group.previews, group.source, 3);
    if (selected.length > 0 && evidenceConfidence === "weak") {
      evidenceConfidence = group.confidence;
    }
    if (selected.length >= 3) {
      break;
    }
  }

  const previews = selected.map((entry) => entry.preview);
  const sourceSet = new Set(selected.map((entry) => entry.source));
  const source: EvidenceSource =
    sourceSet.size === 0
      ? "none"
      : sourceSet.size > 1
        ? "mixed"
        : (sourceSet.values().next().value ?? "none");
  const issues = new Set<EvidenceIssue>();
  if (previews.length === 0) {
    issues.add("missing_evidence");
  }
  if (previews.some((preview) => isLowSignalPreview(preview))) {
    issues.add("low_signal_evidence");
  }
  if (previews.some((preview) => isTruncatedPreview(preview))) {
    issues.add("truncated_evidence");
  }

  return {
    previews,
    source,
    confidence: evidenceConfidence,
    issues: [...issues],
  };
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
      const evidenceSelection = chooseEvidencePreviews(
        context.userPreviews,
        context.assistantPreviews,
      );
      const sessionContext: SessionContext = {
        sessionId,
        evidencePreviews: evidenceSelection.previews,
        evidenceSource: evidenceSelection.source,
        evidenceConfidence: evidenceSelection.confidence,
        evidenceIssues: evidenceSelection.issues,
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
        if (leadPreview.confidence) {
          sessionContext.leadPreviewConfidence = leadPreview.confidence;
        }
        sessionContext.leadPreviewIsCodeLike = isCodeLikePreview(
          leadPreview.preview,
        );
      }
      return [sessionId, sessionContext];
    }),
  );
}
