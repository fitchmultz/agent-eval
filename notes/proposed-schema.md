# Proposed Schema

Portable evaluation should normalize all observed inputs into a small typed core model. TypeScript is the natural fit for this project.

## Design Principles

- Canonical evidence comes from transcript JSONL.
- Optional enrichment never changes event ordering from canonical input.
- Preserve raw data references for auditability.
- Normalize old and new tool-call shapes into one model.
- Prefer explicit unknown states over guessed values.

## Proposed TypeScript Model

```ts
export type SourceKind =
  | "session_jsonl"
  | "state_sqlite"
  | "history_jsonl"
  | "tui_log"
  | "codex_dev_db"
  | "shell_snapshot";

export interface SourceRef {
  kind: SourceKind;
  path: string;
  line?: number;
  table?: string;
  rowId?: string | number;
}

export interface EvalCorpus {
  sessions: EvalSession[];
  incidents: EvalIncident[];
  sourceInventory: InventoryRecord[];
}

export interface InventoryRecord {
  kind: SourceKind;
  path: string;
  discovered: boolean;
  required: boolean;
  notes?: string;
}

export interface EvalSession {
  sessionId: string;
  parentSessionId?: string;
  startedAt?: string;
  endedAt?: string;
  cwd?: string;
  title?: string;
  originator?: string;
  cliVersion?: string;
  modelProvider?: string;
  modelName?: string;
  sandboxPolicy?: string;
  approvalPolicy?: string;
  agentNickname?: string;
  agentRole?: string;
  git?: GitContext;
  turns: EvalTurn[];
  metrics: SessionMetrics;
  sourceRefs: SourceRef[];
}

export interface GitContext {
  sha?: string;
  branch?: string;
  originUrl?: string;
}

export interface EvalTurn {
  turnId?: string;
  sessionId: string;
  startedAt?: string;
  cwd?: string;
  currentDate?: string;
  timezone?: string;
  model?: string;
  summary?: string;
  userInstructions?: string;
  messages: EvalMessage[];
  toolInvocations: ToolInvocation[];
  reasoning: ReasoningRecord[];
  events: AuxiliaryEvent[];
  outcome: TurnOutcome;
  sourceRefs: SourceRef[];
}

export interface EvalMessage {
  role: "user" | "assistant" | "system" | "tool" | "unknown";
  phase?: string;
  text: string;
  contentTypes: string[];
  timestamp?: string;
  sourceRefs: SourceRef[];
}

export interface ToolInvocation {
  callId: string;
  toolName: string;
  status: "completed" | "errored" | "unknown";
  transport: "function_call" | "custom_tool_call";
  argumentsText?: string;
  inputText?: string;
  outputText?: string;
  parsedArguments?: unknown;
  startTimestamp?: string;
  endTimestamp?: string;
  categories: ToolCategory[];
  effects: ToolEffect[];
  sourceRefs: SourceRef[];
}

export type ToolCategory =
  | "read"
  | "write"
  | "search"
  | "test"
  | "lint"
  | "format"
  | "build"
  | "git"
  | "network"
  | "browser"
  | "planning"
  | "delegation"
  | "unknown";

export interface ToolEffect {
  kind:
    | "file_write"
    | "file_create"
    | "file_delete"
    | "command_exec"
    | "verification_run"
    | "subagent_spawn"
    | "web_lookup";
  target?: string;
  confidence: "high" | "medium" | "low";
}

export interface ReasoningRecord {
  encrypted: boolean;
  summaryText?: string;
  sourceRefs: SourceRef[];
}

export interface AuxiliaryEvent {
  eventType: string;
  phase?: string;
  text?: string;
  usage?: TokenUsage;
  sourceRefs: SourceRef[];
}

export interface TokenUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
}

export interface TurnOutcome {
  completionState:
    | "completed"
    | "partial"
    | "blocked"
    | "failed"
    | "unknown";
  finalAssistantMessage?: string;
  verificationSummary?: VerificationSummary;
}

export interface VerificationSummary {
  commands: VerificationCommand[];
  passed: number;
  failed: number;
  unknown: number;
}

export interface VerificationCommand {
  toolCallId?: string;
  commandText: string;
  verdict: "passed" | "failed" | "unknown";
  evidenceText?: string;
}

export interface EvalIncident {
  incidentId: string;
  sessionId: string;
  turnId?: string;
  label: IncidentLabel;
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  evidence: SourceRef[];
}

export type IncidentLabel =
  | "missing_verification"
  | "failed_verification"
  | "unverified_write"
  | "repeated_failed_attempt"
  | "policy_mismatch"
  | "incomplete_outcome"
  | "secret_exposure_risk"
  | "schema_drift"
  | "orphan_subagent"
  | "unknown";

export interface SessionMetrics {
  turnCount: number;
  assistantMessageCount: number;
  userMessageCount: number;
  toolCallCount: number;
  writeLikeToolCount: number;
  verificationCommandCount: number;
  verificationPassedCount: number;
  verificationFailedCount: number;
  subagentCount: number;
}
```

## Normalization Rules

### Session Identity

- Prefer `session_meta.payload.id`
- Fall back to thread ID parsed from filename if needed

### Parent/Child Links

- If `session_meta.payload.source.subagent.thread_spawn.parent_thread_id` exists, set `parentSessionId`

### Tool Calls

- Normalize:
  - `function_call` plus `function_call_output`
  - `custom_tool_call` plus `custom_tool_call_output`
- Pair by `call_id`
- Preserve original transport type

### File Write Detection

High-confidence write tools:

- `apply_patch`
- `mcp__RepoPrompt__apply_edits`
- `mcp__RepoPrompt__file_actions`

Medium-confidence write signals:

- `exec_command` with commands like `git apply`, `sed -i`, `tee`, `cat >`, `mv`, `cp`

### Verification Detection

Mark as verification candidates when a command or tool invocation clearly runs:

- tests
- lint
- typecheck
- format check
- build
- `make ci`
- project validation commands

## Why This Schema

- Small enough for v1
- Precise enough for reproducible metrics
- Flexible enough to survive transcript shape drift
- Explicit about confidence and optional enrichment
