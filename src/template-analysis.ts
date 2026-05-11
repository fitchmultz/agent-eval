/**
 * Purpose: Build a deterministic corpus-level TemplateRegistry for de-templating transcript-visible scaffold text.
 * Responsibilities: Segment messages, normalize signatures, classify repeated scaffold families, and emit public-safe per-session template stats.
 * Scope: Runs after parsing and before session processing; never persists raw scaffold text into public artifacts.
 * Usage: Call `buildTemplateRegistry(parsedSessions)` on the selected corpus, then use per-session analyses during processing.
 * Invariants/Assumptions: Template detection is conservative, corpus-relative, and requires both repetition and scaffold-like cues.
 */

import { createHash } from "node:crypto";

import type { ParsedSession } from "./transcript/types.js";

export const templateFamilyLabels = [
  "instruction_scaffold",
  "verification_checklist_scaffold",
  "reporting_rubric_scaffold",
  "environment_runbook_scaffold",
  "assistant_progress_scaffold",
  "other_scaffold",
] as const;

export type TemplateFamilyLabel = (typeof templateFamilyLabels)[number];

interface MessageSegment {
  key: string;
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  messageIndex: number;
  text: string;
  normalized: string;
  familyLabel: TemplateFamilyLabel | null;
}

export interface TemplateFamilySummary {
  familyId: string;
  label: TemplateFamilyLabel;
  affectedSessionCount: number;
  estimatedTextSharePct: number | null;
}

export interface TemplateLabelSummary {
  familyId: string;
  label: TemplateFamilyLabel;
  affectedSessionCount: number;
  estimatedTextSharePct: number | null;
}

export interface SessionTemplateAnalysis {
  sessionId: string;
  filteredMessages: Map<string, string>;
  artifactScore: number | null;
  textSharePct: number | null;
  hasTemplateContent: boolean;
  flags: string[];
  dominantFamilyId: string | null;
  dominantFamilyLabel: TemplateFamilyLabel | null;
  familyIds: string[];
}

export interface TemplateRegistry {
  sessionAnalyses: Map<string, SessionTemplateAnalysis>;
  familySummaries: TemplateFamilySummary[];
  labelSummaries: TemplateLabelSummary[];
}

interface TemplateSignature {
  familyId: string;
  label: TemplateFamilyLabel;
}

export interface TemplateCorpusBuilder {
  docFrequency: Map<string, Set<string>>;
  familyBySignature: Map<string, TemplateFamilyLabel>;
}

export interface TemplateCorpusIndex {
  templateSignatures: Map<string, TemplateSignature>;
}

export interface TemplateSummaryBuilder {
  familySessionIds: Map<string, Set<string>>;
  familyTemplateChars: Map<string, number>;
  totalCorpusChars: number;
}

function roundPct(value: number): number {
  return Number(value.toFixed(1));
}

export function createTemplateMessageKey(
  sessionId: string,
  turnIndex: number,
  role: "user" | "assistant",
  messageIndex: number,
): string {
  return `${sessionId}:${turnIndex}:${role}:${messageIndex}`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

function normalizeSignature(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/^[-*•]+\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/(?:^|\s)(?:~?\/[^\s]+)+/g, " [path]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[uuid]",
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z\b/gi,
      "[timestamp]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[0-9]{3,}\b/g, "[n]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[hex]")
    .trim();
}

function classifyFamily(
  text: string,
  role: "user" | "assistant",
): TemplateFamilyLabel | null {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 24 || countWords(normalized) < 5) {
    return null;
  }

  if (
    /^[-*•]\s*\[[ x]\]/im.test(normalized) ||
    /\b(?:what changed|how to verify|what'?s next|acceptance criteria|checklist|verify before finishing|run the relevant tests|make ci)\b/i.test(
      normalized,
    )
  ) {
    return "verification_checklist_scaffold";
  }

  if (
    /\b(?:deliverable|impact:|root cause|recommendation|severity:|report metadata|report\.md|summary\.json|what changed|what'?s next)\b/i.test(
      normalized,
    )
  ) {
    return "reporting_rubric_scaffold";
  }

  if (
    /\b(?:environment variables|source home|code[e]?x_eval|session limit|output dir|config files|home directory|source this file|install|bootstrap|shell snapshot)\b/i.test(
      normalized,
    )
  ) {
    return "environment_runbook_scaffold";
  }

  if (
    role === "assistant" &&
    /^(?:i(?:'m| am| will|'ll)|let me|now i need to|i need to|i(?:'ve| have) narrowed|i(?:'m| am) checking|i(?:'m| am) reading)\b/i.test(
      normalized,
    )
  ) {
    return "assistant_progress_scaffold";
  }

  if (
    /\b(?:you are|do not|always|must|should|prefer|stop and ask|execute obvious|hard requirement|instructions|goal|constraints|use when)\b/i.test(
      normalized,
    )
  ) {
    return "instruction_scaffold";
  }

  if (
    /\b(?:agents\.md|skill\.md|parallel integration|deep investigation mode|operator-first|transcript analytics report)\b/i.test(
      normalized,
    )
  ) {
    return "other_scaffold";
  }

  return null;
}

function segmentMessage(
  sessionId: string,
  turnIndex: number,
  role: "user" | "assistant",
  messageIndex: number,
  message: string,
): MessageSegment[] {
  const blocks = message
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const segments: MessageSegment[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const useLines =
      lines.length > 1 && lines.every((line) => /^[-*•]|^\d+[.)]/.test(line));
    const chunks = useLines ? lines : [block];

    for (const chunk of chunks) {
      const text = normalizeWhitespace(chunk);
      if (text.length === 0) {
        continue;
      }

      const normalized = normalizeSignature(text);
      const familyLabel = classifyFamily(text, role);
      segments.push({
        key: createTemplateMessageKey(sessionId, turnIndex, role, messageIndex),
        sessionId,
        turnIndex,
        role,
        messageIndex,
        text,
        normalized,
        familyLabel,
      });
    }
  }

  return segments;
}

function stableFamilyId(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 12);
}

function createEmptySessionAnalysis(
  sessionId: string,
): SessionTemplateAnalysis {
  return {
    sessionId,
    filteredMessages: new Map(),
    artifactScore: 0,
    textSharePct: 0,
    hasTemplateContent: false,
    flags: [],
    dominantFamilyId: null,
    dominantFamilyLabel: null,
    familyIds: [],
  };
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function createTemplateCorpusBuilder(): TemplateCorpusBuilder {
  return {
    docFrequency: new Map(),
    familyBySignature: new Map(),
  };
}

export function addTemplateCorpusSession(
  builder: TemplateCorpusBuilder,
  session: ParsedSession,
): void {
  for (const turn of session.turns) {
    const addSegment = (segment: MessageSegment): void => {
      if (!segment.familyLabel) {
        return;
      }
      const set =
        builder.docFrequency.get(segment.normalized) ?? new Set<string>();
      set.add(session.sessionId);
      builder.docFrequency.set(segment.normalized, set);
      builder.familyBySignature.set(segment.normalized, segment.familyLabel);
    };

    turn.userMessages.forEach((message, messageIndex) => {
      for (const segment of segmentMessage(
        session.sessionId,
        turn.turnIndex,
        "user",
        messageIndex,
        message,
      )) {
        addSegment(segment);
      }
    });

    turn.assistantMessages.forEach((message, messageIndex) => {
      for (const segment of segmentMessage(
        session.sessionId,
        turn.turnIndex,
        "assistant",
        messageIndex,
        message,
      )) {
        addSegment(segment);
      }
    });
  }
}

export function buildTemplateCorpusIndex(
  builder: TemplateCorpusBuilder,
): TemplateCorpusIndex {
  const templateSignatures = new Map<string, TemplateSignature>();
  for (const [signature, sessionIds] of builder.docFrequency.entries()) {
    const label = builder.familyBySignature.get(signature);
    if (!label || sessionIds.size < 2) {
      continue;
    }
    templateSignatures.set(signature, {
      familyId: stableFamilyId(signature),
      label,
    });
  }
  return { templateSignatures };
}

export function createTemplateSummaryBuilder(): TemplateSummaryBuilder {
  return {
    familySessionIds: new Map(),
    familyTemplateChars: new Map(),
    totalCorpusChars: 0,
  };
}

function collectSessionSegments(session: ParsedSession): MessageSegment[] {
  const segments: MessageSegment[] = [];
  for (const turn of session.turns) {
    turn.userMessages.forEach((message, messageIndex) => {
      segments.push(
        ...segmentMessage(
          session.sessionId,
          turn.turnIndex,
          "user",
          messageIndex,
          message,
        ),
      );
    });

    turn.assistantMessages.forEach((message, messageIndex) => {
      segments.push(
        ...segmentMessage(
          session.sessionId,
          turn.turnIndex,
          "assistant",
          messageIndex,
          message,
        ),
      );
    });
  }
  return segments;
}

export function analyzeSessionTemplates(
  session: ParsedSession,
  index: TemplateCorpusIndex,
  summaryBuilder?: TemplateSummaryBuilder,
): SessionTemplateAnalysis {
  const analysis = createEmptySessionAnalysis(session.sessionId);
  const groupedSegments = new Map<string, MessageSegment[]>();
  for (const segment of collectSessionSegments(session)) {
    const grouped = groupedSegments.get(segment.key) ?? [];
    grouped.push(segment);
    groupedSegments.set(segment.key, grouped);
    if (summaryBuilder) {
      summaryBuilder.totalCorpusChars += segment.text.length;
    }
  }

  let sessionRawChars = 0;
  let sessionTemplateChars = 0;

  for (const [key, messageSegments] of groupedSegments.entries()) {
    const keptSegments: string[] = [];
    let messageChars = 0;
    let templateChars = 0;
    const messageFamilyIds = new Set<string>();
    let dominantTemplateCount = 0;
    let dominantTemplateId: string | null = null;
    let dominantTemplateLabel: TemplateFamilyLabel | null = null;

    for (const segment of messageSegments) {
      messageChars += segment.text.length;
      const template = index.templateSignatures.get(segment.normalized);
      if (!template) {
        keptSegments.push(segment.text);
        continue;
      }

      templateChars += segment.text.length;
      messageFamilyIds.add(template.familyId);
      if (summaryBuilder) {
        const sessionIds =
          summaryBuilder.familySessionIds.get(template.familyId) ??
          new Set<string>();
        sessionIds.add(session.sessionId);
        summaryBuilder.familySessionIds.set(template.familyId, sessionIds);
        summaryBuilder.familyTemplateChars.set(
          template.familyId,
          (summaryBuilder.familyTemplateChars.get(template.familyId) ?? 0) +
            segment.text.length,
        );
      }

      const sameFamilyCount = messageSegments.filter(
        (candidate) =>
          index.templateSignatures.get(candidate.normalized)?.familyId ===
          template.familyId,
      ).length;
      if (sameFamilyCount > dominantTemplateCount) {
        dominantTemplateCount = sameFamilyCount;
        dominantTemplateId = template.familyId;
        dominantTemplateLabel = template.label;
      }
    }

    analysis.filteredMessages.set(key, keptSegments.join("\n").trim());
    analysis.familyIds = uniqueSorted([
      ...analysis.familyIds,
      ...messageFamilyIds,
    ]);
    analysis.hasTemplateContent = analysis.familyIds.length > 0;

    sessionRawChars += messageChars;
    sessionTemplateChars += templateChars;
    analysis.textSharePct =
      sessionRawChars > 0
        ? roundPct((sessionTemplateChars / sessionRawChars) * 100)
        : 0;
    analysis.artifactScore = Math.min(
      100,
      Math.round((analysis.textSharePct ?? 0) + analysis.familyIds.length * 10),
    );

    if (dominantTemplateId && dominantTemplateCount > 0) {
      if (!analysis.dominantFamilyId) {
        analysis.dominantFamilyId = dominantTemplateId;
        analysis.dominantFamilyLabel = dominantTemplateLabel;
      }
    }
  }

  const share = analysis.textSharePct ?? 0;
  analysis.flags = uniqueSorted([
    ...(share >= 20 ? ["template_present"] : []),
    ...(share >= 50 ? ["template_heavy"] : []),
    ...(analysis.dominantFamilyLabel ? [analysis.dominantFamilyLabel] : []),
  ]);

  return analysis;
}

export function buildTemplateSummaries(
  index: TemplateCorpusIndex,
  summaryBuilder: TemplateSummaryBuilder,
): Pick<TemplateRegistry, "familySummaries" | "labelSummaries"> {
  const familySummaries = [...index.templateSignatures.values()].reduce<
    Map<string, TemplateFamilySummary>
  >((summaries, family) => {
    if (summaries.has(family.familyId)) {
      return summaries;
    }

    summaries.set(family.familyId, {
      familyId: family.familyId,
      label: family.label,
      affectedSessionCount:
        summaryBuilder.familySessionIds.get(family.familyId)?.size ?? 0,
      estimatedTextSharePct:
        summaryBuilder.totalCorpusChars > 0
          ? roundPct(
              ((summaryBuilder.familyTemplateChars.get(family.familyId) ?? 0) /
                summaryBuilder.totalCorpusChars) *
                100,
            )
          : null,
    });
    return summaries;
  }, new Map());

  const labelSummaries = [...templateFamilyLabels]
    .map<TemplateLabelSummary | null>((label) => {
      const labelFamilies = [...familySummaries.values()].filter(
        (family) => family.label === label,
      );
      if (labelFamilies.length === 0) {
        return null;
      }

      const labelSessionIds = new Set<string>();
      for (const family of labelFamilies) {
        const sessionIds = summaryBuilder.familySessionIds.get(family.familyId);
        if (!sessionIds) {
          continue;
        }
        for (const sessionId of sessionIds) {
          labelSessionIds.add(sessionId);
        }
      }

      return {
        familyId: `label:${label}`,
        label,
        affectedSessionCount: labelSessionIds.size,
        estimatedTextSharePct:
          summaryBuilder.totalCorpusChars > 0
            ? roundPct(
                (labelFamilies.reduce(
                  (total, family) =>
                    total +
                    (summaryBuilder.familyTemplateChars.get(family.familyId) ??
                      0),
                  0,
                ) /
                  summaryBuilder.totalCorpusChars) *
                  100,
              )
            : null,
      };
    })
    .filter((summary): summary is TemplateLabelSummary => summary !== null)
    .sort(
      (left, right) =>
        right.affectedSessionCount - left.affectedSessionCount ||
        (right.estimatedTextSharePct ?? 0) -
          (left.estimatedTextSharePct ?? 0) ||
        left.label.localeCompare(right.label),
    );

  return {
    familySummaries: [...familySummaries.values()].sort(
      (left, right) =>
        right.affectedSessionCount - left.affectedSessionCount ||
        (right.estimatedTextSharePct ?? 0) -
          (left.estimatedTextSharePct ?? 0) ||
        left.familyId.localeCompare(right.familyId),
    ),
    labelSummaries,
  };
}

/**
 * Builds a deterministic TemplateRegistry for the selected parsed corpus.
 */
export function buildTemplateRegistry(
  sessions: readonly ParsedSession[],
): TemplateRegistry {
  const corpusBuilder = createTemplateCorpusBuilder();
  for (const session of sessions) {
    addTemplateCorpusSession(corpusBuilder, session);
  }
  const index = buildTemplateCorpusIndex(corpusBuilder);
  const summaryBuilder = createTemplateSummaryBuilder();
  const sessionAnalyses = new Map<string, SessionTemplateAnalysis>();
  for (const session of sessions) {
    sessionAnalyses.set(
      session.sessionId,
      analyzeSessionTemplates(session, index, summaryBuilder),
    );
  }
  return {
    sessionAnalyses,
    ...buildTemplateSummaries(index, summaryBuilder),
  };
}
