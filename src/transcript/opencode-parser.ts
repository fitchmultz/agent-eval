/**
 * Purpose: Parses opencode file-backed session stores into the evaluator's normalized ParsedSession model.
 * Responsibilities: Join session metadata, message records, and message part records into turns with tool/usage details.
 * Scope: Used for opencode storage/session/*.json files discovered under the opencode data home.
 * Usage: `parseOpencodeTranscriptFile(path, options)` is called via the shared `parseTranscriptFile()` dispatcher.
 * Invariants/Assumptions: The session JSON file is canonical and related messages/parts live under sibling storage/message and storage/part directories.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizeError, TranscriptParseError } from "../errors.js";
import type { SourceProvider, SourceRef } from "../schema.js";
import { extractCommandTextFromArgumentsText } from "../tool-command-text.js";
import { throwIfAborted } from "../utils/abort.js";
import { isFiniteNumber } from "../utils/type-guards.js";
import { createSourceRef } from "./event-router.js";
import {
  appendScoringEvent,
  createTurn,
  hasTurnContent,
} from "./session-builder.js";
import { asRecord, asString, getValue, isRecord } from "./type-guards.js";
import type {
  ParsedSession,
  ParsedToolCall,
  ParsedTurn,
  ParseOptions,
  ScoringEvent,
} from "./types.js";

interface OpencodeSessionRecord {
  id: string;
  directory?: string;
  title?: string;
  version?: string;
  time?: Record<string, unknown>;
}

interface OpencodeMessageRecord {
  id: string;
  role?: string;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  model?: Record<string, unknown>;
  path?: Record<string, unknown>;
  time?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
}

interface OpencodePartRecord {
  id: string;
  type?: string;
  text?: string;
  synthetic?: boolean;
  callID?: string;
  tool?: string;
  state?: Record<string, unknown>;
  time?: Record<string, unknown>;
}

interface OpencodeIndexedMessage {
  message: OpencodeMessageRecord;
  path: string;
  parts: OpencodeIndexedPart[];
  sourceRef: SourceRef;
}

interface OpencodeIndexedPart {
  part: OpencodePartRecord;
  path: string;
  sourceRef: SourceRef;
}

interface OpencodeParseState {
  sessionId: string;
  startedAt?: string;
  endedAt?: string;
  cwd?: string;
  harness: string;
  modelProvider?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: ParsedTurn[];
  currentTurn: ParsedTurn;
  nextTurnIndex: number;
  scoringEvents: ScoringEvent[];
  nextScoringSequenceIndex: number;
  pendingToolCalls: Map<string, ParsedToolCall>;
}

function asNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function getOptionalValue(
  record: Record<string, unknown> | undefined,
  key: string,
): unknown {
  return record ? getValue(record, key) : undefined;
}

function toIsoTime(value: unknown): string | undefined {
  const millis = asNumber(value);
  if (typeof millis !== "number" || !Number.isFinite(millis)) {
    return undefined;
  }
  return new Date(millis).toISOString();
}

function readTime(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return record ? toIsoTime(getValue(record, key)) : undefined;
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  const parsedUnknown: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsedUnknown)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsedUnknown;
}

async function readJsonRecordWithRecovery(
  path: string,
  options: ParseOptions,
  onParseWarning: (path: string, error: Error) => void,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await readJsonRecord(path);
  } catch (error) {
    const normalizedError = normalizeError(error);
    onParseWarning(path, normalizedError);
    if (options.strict) {
      throw new TranscriptParseError(path, 1, normalizedError);
    }
    return undefined;
  }
}

function normalizeJson(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseSessionRecord(
  record: Record<string, unknown>,
  path: string,
): OpencodeSessionRecord {
  const session: OpencodeSessionRecord = {
    id:
      asString(getValue(record, "id")) ?? basename(path).replace(/\.json$/, ""),
  };
  const directory = asString(getValue(record, "directory"));
  const title = asString(getValue(record, "title"));
  const version = asString(getValue(record, "version"));
  const time = asRecord(getValue(record, "time"));
  if (directory) session.directory = directory;
  if (title) session.title = title;
  if (version) session.version = version;
  if (time) session.time = time;
  return session;
}

function parseMessageRecord(
  record: Record<string, unknown>,
  path: string,
): OpencodeMessageRecord {
  const message: OpencodeMessageRecord = {
    id:
      asString(getValue(record, "id")) ?? basename(path).replace(/\.json$/, ""),
  };
  const role = asString(getValue(record, "role"));
  const parentID = asString(getValue(record, "parentID"));
  const modelID = asString(getValue(record, "modelID"));
  const providerID = asString(getValue(record, "providerID"));
  const model = asRecord(getValue(record, "model"));
  const messagePath = asRecord(getValue(record, "path"));
  const time = asRecord(getValue(record, "time"));
  const tokens = asRecord(getValue(record, "tokens"));
  if (role) message.role = role;
  if (parentID) message.parentID = parentID;
  if (modelID) message.modelID = modelID;
  if (providerID) message.providerID = providerID;
  if (model) message.model = model;
  if (messagePath) message.path = messagePath;
  if (time) message.time = time;
  if (tokens) message.tokens = tokens;
  return message;
}

function parsePartRecord(
  record: Record<string, unknown>,
  path: string,
): OpencodePartRecord {
  const part: OpencodePartRecord = {
    id:
      asString(getValue(record, "id")) ?? basename(path).replace(/\.json$/, ""),
    synthetic: getValue(record, "synthetic") === true,
  };
  const type = asString(getValue(record, "type"));
  const text = asString(getValue(record, "text"));
  const callID = asString(getValue(record, "callID"));
  const tool = asString(getValue(record, "tool"));
  const state = asRecord(getValue(record, "state"));
  const time = asRecord(getValue(record, "time"));
  if (type) part.type = type;
  if (text) part.text = text;
  if (callID) part.callID = callID;
  if (tool) part.tool = tool;
  if (state) part.state = state;
  if (time) part.time = time;
  return part;
}

async function safeJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function inferStorageRoot(sessionPath: string): string {
  const projectDirectory = dirname(sessionPath);
  const sessionDirectory = dirname(projectDirectory);
  if (basename(sessionDirectory) === "session") {
    return dirname(sessionDirectory);
  }
  if (basename(projectDirectory) === "session") {
    return dirname(projectDirectory);
  }
  return join(dirname(sessionPath), "..", "..");
}

function createInitialState(
  session: OpencodeSessionRecord,
): OpencodeParseState {
  const startedAt = readTime(session.time, "created");
  const endedAt = readTime(session.time, "updated") ?? startedAt;
  return {
    sessionId: session.id,
    harness: "opencode",
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(session.directory ? { cwd: session.directory } : {}),
    turns: [],
    currentTurn: createTurn(0),
    nextTurnIndex: 0,
    scoringEvents: [],
    nextScoringSequenceIndex: 0,
    pendingToolCalls: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addSourceRef(turn: ParsedTurn, sourceRef: SourceRef): void {
  const exists = turn.sourceRefs.some(
    (candidate) =>
      candidate.provider === sourceRef.provider &&
      candidate.kind === sourceRef.kind &&
      candidate.path === sourceRef.path &&
      candidate.line === sourceRef.line,
  );
  if (!exists) {
    turn.sourceRefs.push(sourceRef);
  }
}

function appendMessageText(messages: string[], value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) {
    messages.push(value);
  }
}

function flushCurrentTurn(state: OpencodeParseState): void {
  if (!hasTurnContent(state.currentTurn)) {
    return;
  }
  state.turns.push(state.currentTurn);
  state.nextTurnIndex += 1;
  state.currentTurn = createTurn(state.nextTurnIndex);
}

function updateStateMetadata(
  state: OpencodeParseState,
  message: OpencodeMessageRecord,
): void {
  const cwd = asString(getOptionalValue(message.path, "cwd"));
  if (!state.cwd && cwd) {
    state.cwd = cwd;
  }
  const providerID =
    message.providerID ??
    asString(getOptionalValue(message.model, "providerID"));
  const modelID =
    message.modelID ?? asString(getOptionalValue(message.model, "modelID"));
  if (providerID) {
    state.modelProvider = providerID;
  }
  if (modelID) {
    state.model = modelID;
  }
  const inputTokens = asNumber(getOptionalValue(message.tokens, "input")) ?? 0;
  const outputTokens =
    asNumber(getOptionalValue(message.tokens, "output")) ?? 0;
  state.inputTokens += inputTokens;
  state.outputTokens += outputTokens;
  state.totalTokens += inputTokens + outputTokens;
  const completedAt =
    readTime(message.time, "completed") ?? readTime(message.time, "created");
  if (completedAt) {
    state.endedAt = completedAt;
  }
}

function setTurnMetadata(
  turn: ParsedTurn,
  message: OpencodeMessageRecord,
  sourceRef: SourceRef,
  fallbackCwd?: string,
): void {
  if (!turn.turnId && message.id) {
    turn.turnId = message.id;
  }
  const startedAt = readTime(message.time, "created");
  if (!turn.startedAt && startedAt) {
    turn.startedAt = startedAt;
  }
  const cwd = asString(getOptionalValue(message.path, "cwd")) ?? fallbackCwd;
  if (!turn.cwd && cwd) {
    turn.cwd = cwd;
  }
  addSourceRef(turn, sourceRef);
}

function partTime(part: OpencodePartRecord): string | undefined {
  const stateTime = asRecord(getOptionalValue(part.state, "time"));
  return (
    readTime(part.time, "start") ??
    readTime(part.time, "end") ??
    readTime(stateTime, "start") ??
    readTime(stateTime, "end")
  );
}

function statusFromState(
  state: Record<string, unknown> | undefined,
): "completed" | "errored" | "unknown" {
  const status = asString(getOptionalValue(state, "status"));
  if (status === "completed") return "completed";
  if (status === "error" || status === "errored") return "errored";
  return "unknown";
}

function appendToolPart(
  state: OpencodeParseState,
  message: OpencodeMessageRecord,
  indexedPart: OpencodeIndexedPart,
): void {
  const { part } = indexedPart;
  const toolState = part.state;
  const toolCall: ParsedToolCall = {
    callId: part.callID ?? part.id,
    toolName: part.tool ?? "unknown_tool",
    categoryHint: "other",
    argumentsText: normalizeJson(getOptionalValue(toolState, "input")),
    outputText: normalizeJson(getOptionalValue(toolState, "output")),
    status: statusFromState(toolState),
    timestamp: partTime(part) ?? readTime(message.time, "created"),
  };
  toolCall.scoringEventIndex = appendScoringEvent(state, {
    kind: "tool_call",
    toolName: toolCall.toolName,
    commandText: extractCommandTextFromArgumentsText(toolCall.argumentsText),
    status: toolCall.status,
    timestamp: toolCall.timestamp,
    cwd: state.currentTurn.cwd ?? state.cwd,
  });
  state.currentTurn.toolCalls.push(toolCall);
  state.pendingToolCalls.set(toolCall.callId, toolCall);
  addSourceRef(state.currentTurn, indexedPart.sourceRef);
}

function appendTextPart(
  state: OpencodeParseState,
  message: OpencodeMessageRecord,
  indexedPart: OpencodeIndexedPart,
): void {
  const text = indexedPart.part.text;
  if (!text || indexedPart.part.synthetic) {
    return;
  }
  const target =
    message.role === "user"
      ? state.currentTurn.userMessages
      : state.currentTurn.assistantMessages;
  appendMessageText(target, text);
  appendScoringEvent(state, {
    kind: message.role === "user" ? "user_message" : "assistant_message",
    text,
    timestamp: partTime(indexedPart.part) ?? readTime(message.time, "created"),
    cwd: state.currentTurn.cwd ?? state.cwd,
  });
  addSourceRef(state.currentTurn, indexedPart.sourceRef);
}

function applyMessage(
  state: OpencodeParseState,
  indexedMessage: OpencodeIndexedMessage,
): void {
  const { message } = indexedMessage;
  updateStateMetadata(state, message);

  if (message.role === "user" && hasTurnContent(state.currentTurn)) {
    flushCurrentTurn(state);
  }

  if (message.role !== "user" && message.role !== "assistant") {
    return;
  }

  setTurnMetadata(
    state.currentTurn,
    message,
    indexedMessage.sourceRef,
    state.cwd,
  );

  const textParts = indexedMessage.parts.filter(
    (part) => part.part.type === "text",
  );
  const toolParts = indexedMessage.parts.filter(
    (part) => part.part.type === "tool",
  );

  for (const indexedPart of textParts) {
    appendTextPart(state, message, indexedPart);
  }

  if (message.role === "assistant") {
    for (const indexedPart of toolParts) {
      appendToolPart(state, message, indexedPart);
    }
  }
}

function messageSortKey(message: OpencodeMessageRecord): number {
  return asNumber(getOptionalValue(message.time, "created")) ?? 0;
}

function partSortKey(part: OpencodePartRecord): number {
  const stateTime = asRecord(getOptionalValue(part.state, "time"));
  return (
    asNumber(getOptionalValue(part.time, "start")) ??
    asNumber(getOptionalValue(part.time, "end")) ??
    asNumber(getOptionalValue(stateTime, "start")) ??
    asNumber(getOptionalValue(stateTime, "end")) ??
    0
  );
}

async function loadMessages(
  storageRoot: string,
  sessionId: string,
  provider: SourceProvider,
  options: ParseOptions,
  onParseWarning: (path: string, error: Error) => void,
): Promise<OpencodeIndexedMessage[]> {
  const messageDirectory = join(storageRoot, "message", sessionId);
  const messageFiles = await safeJsonFiles(messageDirectory);
  const messages: OpencodeIndexedMessage[] = [];

  for (const messagePath of messageFiles) {
    throwIfAborted(options.signal);
    const messageRecord = await readJsonRecordWithRecovery(
      messagePath,
      options,
      onParseWarning,
    );
    if (!messageRecord) {
      continue;
    }
    const message = parseMessageRecord(messageRecord, messagePath);
    const partDirectory = join(storageRoot, "part", message.id);
    const partFiles = await safeJsonFiles(partDirectory);
    const parts: OpencodeIndexedPart[] = [];
    for (const partPath of partFiles) {
      throwIfAborted(options.signal);
      const partRecord = await readJsonRecordWithRecovery(
        partPath,
        options,
        onParseWarning,
      );
      if (!partRecord) {
        continue;
      }
      parts.push({
        part: parsePartRecord(partRecord, partPath),
        path: partPath,
        sourceRef: createSourceRef(provider, partPath, 1),
      });
    }
    parts.sort(
      (left, right) =>
        partSortKey(left.part) - partSortKey(right.part) ||
        left.path.localeCompare(right.path),
    );
    messages.push({
      message,
      path: messagePath,
      parts,
      sourceRef: createSourceRef(provider, messagePath, 1),
    });
  }

  messages.sort(
    (left, right) =>
      messageSortKey(left.message) - messageSortKey(right.message) ||
      left.path.localeCompare(right.path),
  );
  return messages;
}

export async function parseOpencodeTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const provider: SourceProvider = options.sourceProvider ?? "opencode";
  throwIfAborted(options.signal);
  let parseWarningCount = 0;

  const sessionRecord = await readJsonRecordWithRecovery(
    path,
    options,
    (_warningPath, error) => {
      parseWarningCount += 1;
      options.onParseError?.("", 1, error);
    },
  );
  if (!sessionRecord) {
    return {
      sessionId: basename(path).replace(/\.json$/, ""),
      provider,
      path,
      turns: [],
      scoringEvents: [],
      parseWarningCount,
      harness: "opencode",
    };
  }

  const session = parseSessionRecord(sessionRecord, path);
  const state = createInitialState(session);
  const storageRoot = inferStorageRoot(path);
  const messages = await loadMessages(
    storageRoot,
    session.id,
    provider,
    options,
    (warningPath, error) => {
      parseWarningCount += 1;
      options.onParseError?.(warningPath, 1, error);
    },
  );

  for (const message of messages) {
    applyMessage(state, message);
  }

  flushCurrentTurn(state);

  return {
    sessionId: state.sessionId,
    provider,
    path,
    turns: state.turns,
    scoringEvents: state.scoringEvents,
    parseWarningCount,
    harness: state.harness,
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    ...(state.endedAt ? { endedAt: state.endedAt } : {}),
    ...(state.cwd ? { cwd: state.cwd } : {}),
    ...(state.modelProvider ? { modelProvider: state.modelProvider } : {}),
    ...(state.model ? { model: state.model } : {}),
    ...(state.inputTokens > 0 ? { inputTokens: state.inputTokens } : {}),
    ...(state.outputTokens > 0 ? { outputTokens: state.outputTokens } : {}),
    ...(state.totalTokens > 0 ? { totalTokens: state.totalTokens } : {}),
  };
}
