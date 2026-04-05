# Artifact Shapes

This document records actual observed shapes from the local machine. These are examples, not contracts.

## 1. Session Transcript JSONL

Observed top-level line shape:

```json
{
  "timestamp": "2026-03-06T18:47:00.537Z",
  "type": "session_meta",
  "payload": {}
}
```

Observed top-level event types in a recent session:

- `session_meta`
- `turn_context`
- `response_item`
- `event_msg`

### `session_meta`

Observed payload keys:

- `id`
- `timestamp`
- `cwd`
- `originator`
- `cli_version`
- `source`
- `agent_nickname`
- `agent_role`
- `model_provider`
- `base_instructions`
- `git`

Observed caveats:

- `source` may be a simple source string in some stores, but in transcript JSONL it can be a nested object.
- Subagent linkage was observed at:
  - `payload.source.subagent.thread_spawn.parent_thread_id`
  - `payload.source.subagent.thread_spawn.depth`
  - `payload.source.subagent.thread_spawn.agent_nickname`
  - `payload.source.subagent.thread_spawn.agent_role`
- `base_instructions.text` can be very large.

### `turn_context`

Observed payload keys:

- `turn_id`
- `cwd`
- `current_date`
- `timezone`
- `approval_policy`
- `sandbox_policy`
- `model`
- `personality`
- `collaboration_mode`
- `realtime_active`
- `effort`
- `summary`
- `user_instructions`
- `truncation_policy`

Observed caveats:

- This is per-turn context, not just session-global context.
- Useful for compliance evaluation because it records policies active during the turn.

### `response_item`

Observed payload subtype counts in one recent file:

- `function_call`
- `function_call_output`
- `message`
- `reasoning`
- `ghost_snapshot`

Observed subtype counts across a recent corpus sample also included:

- `custom_tool_call`
- `custom_tool_call_output`
- `web_search_call`

This means the analytics engine should support at least old and new tool-call shapes.

#### `response_item.payload.type == "message"`

Observed keys:

- `type`
- `role`
- `content`
- optional `phase`

Observed content item types:

- `input_text`
- `output_text`

Observed caveats:

- Messages are chunked as structured content arrays, not plain strings.
- `phase` can be present for commentary-style assistant messages.

#### `response_item.payload.type == "function_call"`

Observed keys:

- `type`
- `name`
- `arguments`
- `call_id`

Observed sample:

```json
{
  "type": "function_call",
  "name": "exec_command",
  "arguments": "{\"cmd\":\"date\",\"workdir\":\"/tmp/example/Projects/AI/agent-eval\",\"max_output_tokens\":200}",
  "call_id": "call_wpWClKIeM6oGVVxN39M5TzQO"
}
```

Observed caveats:

- `arguments` is a JSON string, not an object.
- Some tools return PTY session IDs indirectly via outputs rather than the call record.

#### `response_item.payload.type == "function_call_output"`

Observed keys:

- `type`
- `call_id`
- `output`

Observed caveats:

- `output` is a plain string blob, often wrapping tool transport metadata plus tool stdout/stderr.
- Pairing to the call requires `call_id`.

#### `response_item.payload.type == "custom_tool_call"`

Observed keys in older sessions:

- `type`
- `status`
- `call_id`
- `name`
- `input`

Observed example use:

- `apply_patch`

Observed caveats:

- File writes may appear as `custom_tool_call` in older transcripts and `function_call` in newer ones.
- The analytics engine should normalize both into the same internal `ToolInvocation`.

#### `response_item.payload.type == "reasoning"`

Observed keys:

- `type`
- `summary`
- `content`
- `encrypted_content`

Observed caveats:

- `encrypted_content` was present.
- Reasoning should not be required for core evaluation because it may be absent, encrypted, or redacted.
- `summary` may still provide short useful hints.

#### `response_item.payload.type == "ghost_snapshot"`

Observed payload path:

- `payload.ghost_commit.id`
- `payload.ghost_commit.parent`
- `payload.ghost_commit.preexisting_untracked_files`
- `payload.ghost_commit.preexisting_untracked_dirs`

Observed caveats:

- Potentially useful for workspace state, but not required for portable methodology.

### `event_msg`

Observed payload variants:

- `user_message`
- `agent_message`
- `task_started`
- `token_count`

#### `event_msg.payload.type == "agent_message"`

Observed keys:

- `type`
- `message`
- `phase`

#### `event_msg.payload.type == "token_count"`

Observed keys:

- `type`
- `info`
- `rate_limits`

Observed caveats:

- Useful for usage metrics, not for semantic reconstruction.

## 2. `state_5.sqlite`

Observed relevant tables and representative columns:

### `threads`

- `id`
- `rollout_path`
- `created_at`
- `updated_at`
- `source`
- `model_provider`
- `cwd`
- `title`
- `sandbox_policy`
- `approval_mode`
- `tokens_used`
- `has_user_event`
- `archived`
- `archived_at`
- `git_sha`
- `git_branch`
- `git_origin_url`
- `cli_version`
- `first_user_message`
- `agent_nickname`
- `agent_role`
- `memory_mode`

Observed caveats:

- Great as an index keyed by thread ID.
- Not the full turn/event record.
- `source` here may be a simple string or serialized object.

### `logs`

- `id`
- `ts`
- `ts_nanos`
- `level`
- `target`
- `message`
- `module_path`
- `file`
- `line`
- `thread_id`
- `process_uuid`
- `estimated_bytes`

Observed caveats:

- `message` can contain `ToolCall:` with serialized arguments.
- This is useful for correlation and diagnostics, but not as canonical truth.

### `thread_dynamic_tools`

- `thread_id`
- `position`
- `name`
- `description`
- `input_schema`

Observed caveat:

- Table existed but had zero rows locally.
- The methodology should not assume dynamic tool definitions are available.

### `stage1_outputs`

- `thread_id`
- `source_updated_at`
- `raw_memory`
- `rollout_summary`
- `generated_at`
- `rollout_slug`
- `usage_count`
- `last_usage`
- `selected_for_phase2`
- `selected_for_phase2_source_updated_at`

Observed caveat:

- Looks like downstream summarization/memory output, not primary evidence.

### `agent_jobs` and `agent_job_items`

- Useful when evaluating bulk agent workflows
- Not necessary for v1 session evaluation

## 3. `history.jsonl`

Observed line shape:

```json
{
  "session_id": "019cc478-a9c0-7e22-b774-f17531aa707a",
  "ts": 1772822774,
  "text": "You are in a fresh local project..."
}
```

Observed caveats:

- Captures user prompt text only
- No assistant reply, no tool calls, no per-turn structure

## 4. `codex-dev.db`

Observed tables:

- `automations`
- `automation_runs`
- `inbox_items`

Observed representative columns:

### `automation_runs`

- `thread_id`
- `automation_id`
- `status`
- `read_at`
- `thread_title`
- `source_cwd`
- `inbox_title`
- `inbox_summary`
- `created_at`
- `updated_at`
- `archived_user_message`
- `archived_assistant_message`
- `archived_reason`

Observed caveat:

- This is useful only if the analytics engine later wants an automation-specific view.

## 5. `shell_snapshots/*.sh`

Observed file characteristics:

- ASCII shell scripts
- Named by thread ID
- Contents resemble shell init/environment snapshots

Observed caveats:

- Not a record of executed commands
- Should not be used as evidence of tool activity or outcomes

## Shape Drift To Support

The analytics engine should explicitly support:

- Old tool call shape:
  - `response_item.payload.type == "custom_tool_call"`
- New tool call shape:
  - `response_item.payload.type == "function_call"`
- Tool outputs as paired records by `call_id`
- Missing optional records:
  - no reasoning
  - no token counts
  - no SQLite
  - no dynamic tool rows
