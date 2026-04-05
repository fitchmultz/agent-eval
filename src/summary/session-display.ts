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
  isPublicOperatorPreview,
  isUnsafePreview,
  normalizePublicPreviewCandidate,
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

function isSecondaryStructuredTitlePreview(preview: string): boolean {
  return /^\d+[.)]\s+/.test(preview) || /\s\d+[.)]\s*$/.test(preview);
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
  const containsInlineCodeResidue =
    /"""|```/.test(normalized) || /[A-Za-z_][\w]*\([^)]*$/.test(normalized);

  return (
    (symbolCount >= 4 && hasCodeKeyword) ||
    (symbolCount >= 6 && /[`{};]/.test(normalized)) ||
    looksLikeSignature ||
    looksLikeRegexLiteral ||
    containsInlineCodeResidue
  );
}

export function isTruncatedPreview(preview: string): boolean {
  const normalized = preview.trimEnd();
  return normalized.endsWith("...") || normalized.endsWith("…");
}

function splitPreviewSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9#<])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isWrapperLeadSentence(preview: string): boolean {
  return (
    /^when asked about:\s*/i.test(preview) ||
    /^when listing skills,\s*output approximately as follows\b/i.test(
      preview,
    ) ||
    /^user request:\s*/i.test(preview) ||
    /^deliverables expected in this repo:\s*/i.test(preview) ||
    /^pro\s*-\s*(?:light|standard|extended|heavy)\.?$/i.test(preview) ||
    /^every file in this project included in the artifact upload\.?$/i.test(
      preview,
    )
  );
}

function normalizeLeadPreviewForTitle(preview: string): string {
  let normalized = preview
    .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)+/, "")
    .replace(/^\s*["'“”‘’]\s*/, "")
    .replace(/^.*?\bthat being said,\s*/i, "")
    .replace(/^user request:\s*/i, "")
    .replace(/^deliverables expected in this repo:\s*/i, "")
    .trim();

  normalized = normalized.split(/\s+(?=\d+[.)]\s+)/)[0]?.trim() ?? normalized;

  const substantiveSentences = splitPreviewSentences(normalized).filter(
    (sentence) => !isWrapperLeadSentence(sentence),
  );
  if (substantiveSentences.length > 0) {
    normalized = substantiveSentences[0] ?? normalized;
  }

  return normalized.trim();
}

function appendUniquePreviewEntries(
  target: Array<{ preview: string; source: "user" | "assistant" }>,
  previews: readonly string[],
  source: "user" | "assistant",
  maxItems: number,
): void {
  for (const preview of selectBestPreviews(previews, maxItems)) {
    const normalizedPreview = normalizePublicPreviewCandidate(preview);
    if (
      normalizedPreview.length === 0 ||
      target.some((entry) => entry.preview === normalizedPreview)
    ) {
      continue;
    }
    target.push({ preview: normalizedPreview, source });
    if (target.length >= maxItems) {
      return;
    }
  }
}

function previewSignalTokens(preview: string): string[] {
  return (
    preview
      .toLowerCase()
      .match(/[a-z][a-z0-9_./-]{2,}/g)
      ?.filter(
        (token) =>
          !new Set([
            "that",
            "this",
            "with",
            "from",
            "they",
            "them",
            "your",
            "have",
            "what",
            "when",
            "where",
            "which",
            "would",
            "could",
            "should",
            "after",
            "before",
            "then",
            "there",
            "their",
            "about",
            "because",
            "please",
          ]).has(token),
      ) ?? []
  );
}

function hasMeaningfulPreviewOverlap(
  primaryPreview: string,
  candidatePreview: string,
): boolean {
  const primaryTokens = new Set(previewSignalTokens(primaryPreview));
  if (primaryTokens.size === 0) {
    return false;
  }

  return previewSignalTokens(candidatePreview).some((token) =>
    primaryTokens.has(token),
  );
}

function isInstructionBulletBundle(preview: string): boolean {
  const bulletCount = preview.match(/(?:^|\s)[-*•]\s+/g)?.length ?? 0;
  return (
    bulletCount >= 2 &&
    /\b(do not|prefer|let me|accept|blocked|hide behind|large explanations|tiny drills|recall over)/i.test(
      preview,
    )
  );
}

function isGenericImperativeStub(preview: string): boolean {
  const normalized = normalizeLeadPreviewForTitle(preview);
  const words = normalized.split(/\s+/).filter((word) => word.length > 0);
  return (
    words.length <= 4 &&
    /^(?:please\s+)?(?:do|debug|fix|review|inspect|check|investigate|implement)(?:\s+(?:it|this|that|this\s+(?:change|issue|bug)))?\.?$/i.test(
      normalized,
    )
  );
}

function isContextSetupPreview(preview: string): boolean {
  return (
    /^i just\s+(?:created|forked|cloned|opened|re-ran|reran|ran|reloaded|deployed)\b/i.test(
      preview,
    ) || /^if you need\b.*\blet me know\b/i.test(preview)
  );
}

function isSecondaryEvidenceResiduePreview(preview: string): boolean {
  return (
    /^context optimization strategy:\s*/i.test(preview) ||
    /^for mcp modes \(like the current discover mode\), selected files are automatically compressed\b/i.test(
      preview,
    ) ||
    /^now i have a thorough understanding of the problem\b/i.test(preview) ||
    /^now i have a thorough understanding of the continuity system\b/i.test(
      preview,
    ) ||
    /^now i have everything i need\.\s*let me craft the handoff prompt:?$/i.test(
      preview,
    ) ||
    /^good\s*[,—-].*\bwell within\b/i.test(preview) ||
    /^we['’]re at\s*~?\d/i.test(preview) ||
    /\bwell within budget\b/i.test(preview) ||
    /\bwell within (?:the )?\d{1,3}(?:,\d{3})*\b/i.test(preview) ||
    /\bcheck token budget\b/i.test(preview) ||
    /\blet me (?:craft|set) the handoff prompt\b/i.test(preview) ||
    /^here'?s the full review output from reviewer model\b/i.test(preview) ||
    /^my best evidence-backed bet is:\s*/i.test(preview) ||
    /^i reloaded\.\s*/i.test(preview) ||
    /\bextension changes are active in this thread now\b/i.test(preview) ||
    /\bif you want,?\s+i can\b/i.test(preview) ||
    /\bcommit to (?:our|my) fork\b/i.test(preview) ||
    /\bopen a pr\b/i.test(preview) ||
    /\b\d+[.)]\s*$/i.test(preview)
  );
}

function isWeakLeadPreview(preview: string): boolean {
  return (
    isInstructionBulletBundle(preview) ||
    isGenericImperativeStub(preview) ||
    isContextSetupPreview(preview) ||
    /^(?:sounds good|okay|ok|alright|all right)\b/i.test(preview) ||
    /^(?:so,?\s+)?i(?:['’]m| am) going to\b/i.test(preview) ||
    /^(?:so,?\s+)?let me\b/i.test(preview) ||
    /^i(?:['’]m| am)\s+(?:checking|reading|reviewing|inspecting|looking|trying|focusing|opening|walking|digging|tightening)\b/i.test(
      preview,
    ) ||
    /^(?:first\s+)?i(?:['’]m| am)\s+re-?checking\b/i.test(preview) ||
    /^there(?:['’]s| is) one more important thing to verify before\b/i.test(
      preview,
    ) ||
    /^also,?\s+i need to consider\b/i.test(preview) ||
    /^this way,?\s+i can\b/i.test(preview) ||
    /^small concise hint\b/i.test(preview) ||
    /^one minor tweak\b/i.test(preview) ||
    /^i think i need to revisit this\b/i.test(preview) ||
    /^i either don['’]?t get it\b/i.test(preview) ||
    /\byou are being intentionally confusing\b/i.test(preview) ||
    /^the key point:\s*/i.test(preview) ||
    /^my honest view\b/i.test(preview) ||
    /^better rule going forward\b/i.test(preview) ||
    isSecondaryEvidenceResiduePreview(preview) ||
    /^the helper scripts are present\b/i.test(preview) ||
    /^the (?:first|initial) pass found\b/i.test(preview) ||
    /\*\*Bottom Line\*\*/i.test(preview) ||
    /^if we want\b.+\bi['’]?d implement:\s*$/i.test(preview) ||
    /^staging tests to assert\b/i.test(preview) ||
    /^stabilize them\./i.test(preview) ||
    /^(?:\d+\.\s*)?on unexpected failure:\s/i.test(preview) ||
    /^(?:\d+\.\s*)?establish the problem narrowly\b/i.test(preview) ||
    /^work through each category systematically\b/i.test(preview) ||
    /^no additional runs at this time please\b/i.test(preview) ||
    /^no docs\/report\. just fix the code\b/i.test(preview) ||
    /^-?\s*(?:problem|impact|fix|root cause|recommendation|severity|violation):\s/i.test(
      preview,
    ) ||
    /^why:\s/i.test(preview) ||
    isWrapperLeadSentence(preview)
  );
}

function leadSentence(preview: string): string {
  const normalized = normalizeLeadPreviewForTitle(preview);
  return splitPreviewSentences(normalized)[0] ?? normalized;
}

function hasUserLeadSignalPreview(preview: string): boolean {
  const lead = leadSentence(preview);
  return (
    /\b(please|help me|can you|could you|would you|i need|i want|we need|we want|bug|issue|problem|broken|broke|failing|failure|regression|error|wrong|confusing|stuck|fix|remove|replace|port|migrate|integrate|support|review|audit|inspect|check|investigate|scan)\b/i.test(
      lead,
    ) ||
    /^(?:do|implement|build|debug|wire|make|update|add|finish|port|scan|review|audit|inspect|check|investigate|initial)\b/i.test(
      lead,
    )
  );
}

function hasUserMediumLeadSignalPreview(preview: string): boolean {
  const lead = leadSentence(preview);
  return (
    hasUserLeadSignalPreview(preview) ||
    /\?$/.test(lead.trim()) ||
    /^(?:is|are|why|what|when|where|which|who|how|should|can|could|would|did|does|do)\b/i.test(
      lead,
    )
  );
}

function hasAssistantLeadSignalPreview(preview: string): boolean {
  return /\b(bug|issue|problem|broken|broke|failing|failure|regression|error|wrong|confusing|stuck|fix|fixed|remove|replace|verify|verified|root cause|user-visible|timeout|timed out|misclassif(?:y|ies|ied|ying))\b/i.test(
    leadSentence(preview),
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
          isPublicOperatorPreview(preview, {
            source: "user",
            purpose: "title",
          }) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview) &&
          hasUserLeadSignalPreview(preview),
      ),
      source: "user",
      confidence: "strong",
    },
    {
      previews: userPreviews.filter(
        (preview) =>
          isPublicOperatorPreview(preview, {
            source: "user",
            purpose: "title",
          }) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview) &&
          hasUserMediumLeadSignalPreview(preview),
      ),
      source: "user",
      confidence: "medium",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          isPublicOperatorPreview(preview, {
            source: "assistant",
            purpose: "title",
          }) &&
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
    const rankedPreviews = [...new Set(group.previews)];
    for (const allowSecondaryStructured of [false, true]) {
      for (const preview of rankedPreviews) {
        if (
          !allowSecondaryStructured &&
          isSecondaryStructuredTitlePreview(preview)
        ) {
          continue;
        }

        const normalized = normalizeLeadPreviewForTitle(preview);
        if (normalized.length === 0 || isWeakLeadPreview(normalized)) {
          continue;
        }

        return {
          preview: normalized,
          source: group.source,
          confidence: group.confidence,
        };
      }
    }
  }

  return {};
}

function chooseEvidencePreviews(
  userPreviews: readonly string[],
  assistantPreviews: readonly string[],
  leadPreview?: LeadPreviewSelection,
): EvidencePreviewSelection {
  const selected: Array<{ preview: string; source: "user" | "assistant" }> = [];
  const groups: PreviewCandidateGroup[] = [
    {
      previews: userPreviews.filter(
        (preview) =>
          isPublicOperatorPreview(preview, {
            source: "user",
            purpose: "evidence",
          }) &&
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
          isPublicOperatorPreview(preview, {
            source: "assistant",
            purpose: "evidence",
          }) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview) &&
          hasAssistantLeadSignalPreview(preview),
      ),
      source: "assistant",
      confidence: "medium",
    },
    {
      previews: userPreviews.filter(
        (preview) =>
          isPublicOperatorPreview(preview, {
            source: "user",
            purpose: "evidence",
          }) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview),
      ),
      source: "user",
      confidence: "medium",
    },
    {
      previews: assistantPreviews.filter(
        (preview) =>
          isPublicOperatorPreview(preview, {
            source: "assistant",
            purpose: "evidence",
          }) &&
          !isUnsafePreview(preview) &&
          !isCodeLikePreview(preview) &&
          !isWeakLeadPreview(preview),
      ),
      source: "assistant",
      confidence: "weak",
    },
  ];

  let evidenceConfidence: SummaryConfidence = "weak";

  if (
    leadPreview?.preview &&
    leadPreview.source &&
    isPublicOperatorPreview(leadPreview.preview, {
      source: leadPreview.source,
      purpose: "evidence",
    }) &&
    !isUnsafePreview(leadPreview.preview) &&
    !isCodeLikePreview(leadPreview.preview) &&
    !isWeakLeadPreview(leadPreview.preview)
  ) {
    selected.push({
      preview: normalizePublicPreviewCandidate(leadPreview.preview),
      source: leadPreview.source,
    });
    evidenceConfidence = leadPreview.confidence ?? evidenceConfidence;
  }

  for (const group of groups) {
    appendUniquePreviewEntries(selected, group.previews, group.source, 3);
    if (selected.length > 0 && evidenceConfidence === "weak") {
      evidenceConfidence = group.confidence;
    }
    if (selected.length >= 3) {
      break;
    }
  }

  const primarySelected = selected[0];
  const leadPreviewText = leadPreview?.preview;
  const filteredSelected =
    leadPreviewText && primarySelected && selected.length > 1
      ? [
          primarySelected,
          ...selected
            .slice(1)
            .filter(
              (entry) =>
                !isSecondaryEvidenceResiduePreview(entry.preview) &&
                hasMeaningfulPreviewOverlap(leadPreviewText, entry.preview),
            ),
        ]
      : selected;

  const previews = filteredSelected.map((entry) => entry.preview);
  const sourceSet = new Set(filteredSelected.map((entry) => entry.source));
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
    normalized === ".pi" ||
    normalized === ".codex" ||
    normalized === ".claude" ||
    normalized === "Downloads" ||
    normalized === "Desktop" ||
    normalized === "Documents" ||
    normalized === "Movies" ||
    normalized === "Music" ||
    normalized === "Pictures" ||
    normalized === "redacted-session-root" ||
    normalized.startsWith("-private-var-folders-") ||
    /^--.+--$/.test(normalized)
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
        leadPreview,
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
