/**
 * Purpose: Unit tests for individual transcript parser event handlers.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests handlers in isolation to ensure proper state management.
 */
import { describe, expect, it } from "vitest";

import type { SourceRef } from "../src/schema.js";
import {
  buildParsedSession,
  createParserContext,
  createTurn,
  handleCustomToolCallOutputResponse,
  handleCustomToolCallResponse,
  handleFunctionCallOutputResponse,
  handleFunctionCallResponse,
  handleMessageResponse,
  handleResponseItemEvent,
  handleSessionMetaEvent,
  handleTurnContextEvent,
  hasTurnContent,
  type ParserContext,
} from "../src/transcript/index.js";

function createTestSourceRef(line = 1): SourceRef {
  return {
    provider: "codex",
    kind: "session_jsonl",
    path: "/test/session.jsonl",
    line,
  };
}

function createTestContext(): ParserContext {
  return createParserContext("/test/session.jsonl");
}

describe("hasTurnContent", () => {
  it("returns false for empty turn", () => {
    const turn = createTurn(0);
    expect(hasTurnContent(turn)).toBe(false);
  });

  it("returns true when userMessages has content", () => {
    const turn = createTurn(0);
    turn.userMessages.push("Hello");
    expect(hasTurnContent(turn)).toBe(true);
  });

  it("returns true when assistantMessages has content", () => {
    const turn = createTurn(0);
    turn.assistantMessages.push("Hi there");
    expect(hasTurnContent(turn)).toBe(true);
  });

  it("returns true when toolCalls has content", () => {
    const turn = createTurn(0);
    turn.toolCalls.push({
      callId: "call-1",
      toolName: "test_tool",
      categoryHint: "function_call",
      status: "unknown",
    });
    expect(hasTurnContent(turn)).toBe(true);
  });
});

describe("createParserContext", () => {
  it("derives the fallback session id from the filename", () => {
    const context = createParserContext(
      "/tmp/prefix-alpha-beta-gamma-delta-epsilon.jsonl",
    );

    expect(context.sessionId).toBe("alpha-beta-gamma-delta-epsilon");
  });
});

describe("handleSessionMetaEvent", () => {
  it("updates sessionId from payload", () => {
    const context = createTestContext();
    const payload = { id: "new-session-id" };

    handleSessionMetaEvent(payload, {}, context);

    expect(context.sessionId).toBe("new-session-id");
  });

  it("keeps existing sessionId when payload id is missing", () => {
    const context = createTestContext();
    context.sessionId = "existing-id";
    const payload = {};

    handleSessionMetaEvent(payload, {}, context);

    expect(context.sessionId).toBe("existing-id");
  });

  it("updates sessionStartedAt from payload timestamp", () => {
    const context = createTestContext();
    const payload = { timestamp: "2026-03-06T10:00:00.000Z" };

    handleSessionMetaEvent(payload, {}, context);

    expect(context.sessionStartedAt).toBe("2026-03-06T10:00:00.000Z");
  });

  it("falls back to event timestamp when payload timestamp is missing", () => {
    const context = createTestContext();
    const payload = {};
    const event = { timestamp: "2026-03-06T11:00:00.000Z" };

    handleSessionMetaEvent(payload, event, context);

    expect(context.sessionStartedAt).toBe("2026-03-06T11:00:00.000Z");
  });

  it("updates sessionCwd from payload", () => {
    const context = createTestContext();
    const payload = { cwd: "/workspace/project" };

    handleSessionMetaEvent(payload, {}, context);

    expect(context.sessionCwd).toBe("/workspace/project");
  });

  it("extracts parentSessionId from nested source.subagent.thread_spawn", () => {
    const context = createTestContext();
    const payload = {
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-123",
          },
        },
      },
    };

    handleSessionMetaEvent(payload, {}, context);

    expect(context.parentSessionId).toBe("parent-123");
  });

  it("handles missing nested source structure gracefully", () => {
    const context = createTestContext();
    const payload = { source: {} };

    handleSessionMetaEvent(payload, {}, context);

    expect(context.parentSessionId).toBeUndefined();
  });
});

describe("handleTurnContextEvent", () => {
  it("flushes current turn when it has content", () => {
    const context = createTestContext();
    context.currentTurn.userMessages.push("Existing message");

    handleTurnContextEvent(
      { turn_id: "turn-2" },
      {},
      createTestSourceRef(),
      context,
    );

    expect(context.turns).toHaveLength(1);
    expect(context.turns[0]?.userMessages).toEqual(["Existing message"]);
    expect(context.currentTurn.turnIndex).toBe(1);
  });

  it("does not flush empty current turn", () => {
    const context = createTestContext();

    handleTurnContextEvent(
      { turn_id: "turn-1" },
      {},
      createTestSourceRef(),
      context,
    );

    expect(context.turns).toHaveLength(0);
    expect(context.currentTurn.turnIndex).toBe(0);
  });

  it("sets turnId from payload", () => {
    const context = createTestContext();

    handleTurnContextEvent(
      { turn_id: "turn-abc" },
      {},
      createTestSourceRef(),
      context,
    );

    expect(context.currentTurn.turnId).toBe("turn-abc");
  });

  it("sets startedAt from event timestamp", () => {
    const context = createTestContext();
    const event = { timestamp: "2026-03-06T12:00:00.000Z" };

    handleTurnContextEvent({}, event, createTestSourceRef(), context);

    expect(context.currentTurn.startedAt).toBe("2026-03-06T12:00:00.000Z");
  });

  it("sets cwd from payload, falling back to sessionCwd", () => {
    const context = createTestContext();
    context.sessionCwd = "/default/cwd";

    handleTurnContextEvent(
      { cwd: "/specific/cwd" },
      {},
      createTestSourceRef(),
      context,
    );

    expect(context.currentTurn.cwd).toBe("/specific/cwd");
  });

  it("uses sessionCwd when payload cwd is missing", () => {
    const context = createTestContext();
    context.sessionCwd = "/default/cwd";

    handleTurnContextEvent({}, {}, createTestSourceRef(), context);

    expect(context.currentTurn.cwd).toBe("/default/cwd");
  });

  it("adds sourceRef to current turn", () => {
    const context = createTestContext();
    const sourceRef = createTestSourceRef(42);

    handleTurnContextEvent({}, {}, sourceRef, context);

    expect(context.currentTurn.sourceRefs).toHaveLength(1);
    expect(context.currentTurn.sourceRefs[0]?.line).toBe(42);
  });
});

describe("handleMessageResponse", () => {
  it("adds user message to userMessages array", () => {
    const context = createTestContext();
    const payload = {
      role: "user",
      content: [{ type: "input_text", text: "Hello, world!" }],
    };

    handleMessageResponse(payload, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toEqual(["Hello, world!"]);
  });

  it("adds assistant message to assistantMessages array", () => {
    const context = createTestContext();
    const payload = {
      role: "assistant",
      content: [{ type: "text", text: "How can I help?" }],
    };

    handleMessageResponse(payload, createTestSourceRef(), context);

    expect(context.currentTurn.assistantMessages).toEqual(["How can I help?"]);
  });

  it("ignores messages with unknown role", () => {
    const context = createTestContext();
    const payload = {
      role: "system",
      content: [{ type: "text", text: "System message" }],
    };

    handleMessageResponse(payload, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toHaveLength(0);
    expect(context.currentTurn.assistantMessages).toHaveLength(0);
  });

  it("ignores messages with no text content", () => {
    const context = createTestContext();
    const payload = {
      role: "user",
      content: [{ type: "image", url: "image.png" }],
    };

    handleMessageResponse(payload, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toHaveLength(0);
  });

  it("adds sourceRef to current turn", () => {
    const context = createTestContext();
    const payload = {
      role: "user",
      content: [{ type: "input_text", text: "Test" }],
    };

    handleMessageResponse(payload, createTestSourceRef(10), context);

    expect(context.currentTurn.sourceRefs).toHaveLength(1);
    expect(context.currentTurn.sourceRefs[0]?.line).toBe(10);
  });

  it("joins multiple text parts with newlines", () => {
    const context = createTestContext();
    const payload = {
      role: "user",
      content: [
        { type: "input_text", text: "Line 1" },
        { type: "input_text", text: "Line 2" },
      ],
    };

    handleMessageResponse(payload, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toEqual(["Line 1\nLine 2"]);
  });
});

describe("handleFunctionCallResponse", () => {
  it("creates pending tool call with required fields", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "exec_command",
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.has("call-1")).toBe(true);
    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.callId).toBe("call-1");
    expect(toolCall?.toolName).toBe("exec_command");
    expect(toolCall?.categoryHint).toBe("function_call");
    expect(toolCall?.status).toBe("unknown");
  });

  it("adds arguments when present", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "exec_command",
      arguments: '{"cmd": "ls -la"}',
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.argumentsText).toBe('{"cmd": "ls -la"}');
  });

  it("adds timestamp when present in event", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "exec_command",
    };
    const event = { timestamp: "2026-03-06T13:00:00.000Z" };

    handleFunctionCallResponse(payload, event, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.timestamp).toBe("2026-03-06T13:00:00.000Z");
  });

  it("ignores calls with missing call_id", () => {
    const context = createTestContext();
    const payload = {
      name: "exec_command",
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.size).toBe(0);
  });

  it("ignores calls with missing name", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.size).toBe(0);
  });

  it("adds tool call to current turn's toolCalls array", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "exec_command",
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(), context);

    expect(context.currentTurn.toolCalls).toHaveLength(1);
    expect(context.currentTurn.toolCalls[0]?.callId).toBe("call-1");
  });

  it("adds sourceRef to current turn", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "exec_command",
    };

    handleFunctionCallResponse(payload, {}, createTestSourceRef(20), context);

    expect(context.currentTurn.sourceRefs).toHaveLength(1);
    expect(context.currentTurn.sourceRefs[0]?.line).toBe(20);
  });
});

describe("handleFunctionCallOutputResponse", () => {
  it("updates pending tool call with output", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "exec_command",
      categoryHint: "function_call",
      status: "unknown",
    });

    const payload = {
      call_id: "call-1",
      output: "Process exited with code 0",
    };

    handleFunctionCallOutputResponse(payload, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.outputText).toBe("Process exited with code 0");
    expect(toolCall?.status).toBe("completed");
  });

  it("sets status to errored on failure output", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "exec_command",
      categoryHint: "function_call",
      status: "unknown",
    });

    const payload = {
      call_id: "call-1",
      output: "Command failed with exit code 1",
    };

    handleFunctionCallOutputResponse(payload, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.status).toBe("errored");
  });

  it("ignores calls with unknown call_id", () => {
    const context = createTestContext();

    const payload = {
      call_id: "unknown-call",
      output: "Process exited with code 0",
    };

    handleFunctionCallOutputResponse(payload, createTestSourceRef(), context);

    // Should not throw, just silently ignore
    expect(context.currentTurn.sourceRefs).toHaveLength(1);
  });

  it("ignores calls with missing call_id", () => {
    const context = createTestContext();

    const payload = {
      output: "Process exited with code 0",
    };

    handleFunctionCallOutputResponse(payload, createTestSourceRef(), context);

    // No sourceRef should be added when call_id is missing (early return)
    expect(context.currentTurn.sourceRefs).toHaveLength(0);
  });

  it("adds sourceRef to current turn", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      output: "Done",
    };

    handleFunctionCallOutputResponse(payload, createTestSourceRef(30), context);

    expect(context.currentTurn.sourceRefs).toHaveLength(1);
    expect(context.currentTurn.sourceRefs[0]?.line).toBe(30);
  });
});

describe("handleCustomToolCallResponse", () => {
  it("creates pending tool call with categoryHint 'custom_tool_call'", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "legacy_tool",
      status: "completed",
    };

    handleCustomToolCallResponse(payload, {}, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.categoryHint).toBe("custom_tool_call");
    expect(toolCall?.status).toBe("completed");
  });

  it("sets status to unknown when not 'completed'", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "legacy_tool",
      status: "failed",
    };

    handleCustomToolCallResponse(payload, {}, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.status).toBe("unknown");
  });

  it("adds input as argumentsText", () => {
    const context = createTestContext();
    const payload = {
      call_id: "call-1",
      name: "legacy_tool",
      input: "*** Begin Patch\n*** End Patch",
    };

    handleCustomToolCallResponse(payload, {}, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.argumentsText).toBe("*** Begin Patch\n*** End Patch");
  });

  it("ignores calls with missing call_id or name", () => {
    const context = createTestContext();

    handleCustomToolCallResponse(
      { call_id: "call-1" },
      {},
      createTestSourceRef(),
      context,
    );
    expect(context.pendingToolCalls.size).toBe(0);

    handleCustomToolCallResponse(
      { name: "tool" },
      {},
      createTestSourceRef(),
      context,
    );
    expect(context.pendingToolCalls.size).toBe(0);
  });
});

describe("handleCustomToolCallOutputResponse", () => {
  it("updates pending tool call with output for legacy format", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "legacy_tool",
      categoryHint: "custom_tool_call",
      status: "unknown",
    });

    const payload = {
      call_id: "call-1",
      output: "Command succeeded",
    };

    handleCustomToolCallOutputResponse(payload, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.outputText).toBe("Command succeeded");
    expect(toolCall?.status).toBe("completed");
  });

  it("handles error output correctly", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "legacy_tool",
      categoryHint: "custom_tool_call",
      status: "unknown",
    });

    const payload = {
      call_id: "call-1",
      output: "Process exited with code 2",
    };

    handleCustomToolCallOutputResponse(payload, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.status).toBe("errored");
  });
});

describe("handleResponseItemEvent", () => {
  it("routes message responses to handleMessageResponse", () => {
    const context = createTestContext();
    const payload = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Hello" }],
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toEqual(["Hello"]);
  });

  it("routes function_call responses to handleFunctionCallResponse", () => {
    const context = createTestContext();
    const payload = {
      type: "function_call",
      call_id: "call-1",
      name: "test_tool",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.has("call-1")).toBe(true);
  });

  it("routes function_call_output responses to handleFunctionCallOutputResponse", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "test_tool",
      categoryHint: "function_call",
      status: "unknown",
    });

    const payload = {
      type: "function_call_output",
      call_id: "call-1",
      output: "Process exited with code 0",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    const toolCall = context.pendingToolCalls.get("call-1");
    expect(toolCall?.status).toBe("completed");
  });

  it("routes custom_tool_call responses to handleCustomToolCallResponse", () => {
    const context = createTestContext();
    const payload = {
      type: "custom_tool_call",
      call_id: "call-1",
      name: "legacy_tool",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.has("call-1")).toBe(true);
  });

  it("routes custom_tool_call_output responses to handleCustomToolCallOutputResponse", () => {
    const context = createTestContext();
    context.pendingToolCalls.set("call-1", {
      callId: "call-1",
      toolName: "legacy_tool",
      categoryHint: "custom_tool_call",
      status: "unknown",
    });

    const payload = {
      type: "custom_tool_call_output",
      call_id: "call-1",
      output: "Done",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.pendingToolCalls.get("call-1")?.outputText).toBe("Done");
  });

  it("ignores unknown response types", () => {
    const context = createTestContext();
    const payload = {
      type: "unknown_type",
      data: "some data",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toHaveLength(0);
    expect(context.currentTurn.toolCalls).toHaveLength(0);
  });

  it("does nothing when response type is missing", () => {
    const context = createTestContext();
    const payload = {
      data: "some data",
    };

    handleResponseItemEvent(payload, {}, createTestSourceRef(), context);

    expect(context.currentTurn.userMessages).toHaveLength(0);
    expect(context.currentTurn.toolCalls).toHaveLength(0);
  });
});

describe("buildParsedSession", () => {
  it("builds session with basic fields", () => {
    const context = createTestContext();
    context.sessionId = "session-123";
    context.currentTurn.userMessages.push("Hello");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.sessionId).toBe("session-123");
    expect(session.path).toBe("/path/to/session.jsonl");
    expect(session.turns).toHaveLength(1);
  });

  it("includes optional parentSessionId when set", () => {
    const context = createTestContext();
    context.parentSessionId = "parent-123";
    context.currentTurn.userMessages.push("Hello");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.parentSessionId).toBe("parent-123");
  });

  it("omits optional parentSessionId when not set", () => {
    const context = createTestContext();
    context.currentTurn.userMessages.push("Hello");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.parentSessionId).toBeUndefined();
  });

  it("includes optional startedAt when set", () => {
    const context = createTestContext();
    context.sessionStartedAt = "2026-03-06T10:00:00.000Z";
    context.currentTurn.userMessages.push("Hello");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.startedAt).toBe("2026-03-06T10:00:00.000Z");
  });

  it("includes optional cwd when set", () => {
    const context = createTestContext();
    context.sessionCwd = "/workspace/project";
    context.currentTurn.userMessages.push("Hello");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.cwd).toBe("/workspace/project");
  });

  it("flushes current turn if it has content", () => {
    const context = createTestContext();
    context.currentTurn.userMessages.push("Message");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.userMessages).toEqual(["Message"]);
  });

  it("does not add empty current turn", () => {
    const context = createTestContext();

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.turns).toHaveLength(0);
  });

  it("preserves multiple flushed turns", () => {
    const context = createTestContext();
    context.turns.push(
      { ...createTurn(0), userMessages: ["First"] },
      { ...createTurn(1), userMessages: ["Second"] },
    );
    context.currentTurn.userMessages.push("Third");

    const session = buildParsedSession(
      context,
      "/path/to/session.jsonl",
      "codex",
    );

    expect(session.turns).toHaveLength(3);
    expect(session.turns[0]?.userMessages).toEqual(["First"]);
    expect(session.turns[1]?.userMessages).toEqual(["Second"]);
    expect(session.turns[2]?.userMessages).toEqual(["Third"]);
  });
});
