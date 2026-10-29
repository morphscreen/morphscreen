// AG-UI 1.0's schema as a table. Generated from spec/agui/schema.json by
// spec/agui.ts; don't edit.

use super::strip::Def::{self, *};
use super::strip::Field;
use super::strip::Ty::*;

/** An event (the union of every event type). */
pub const EVENT: usize = 0;
/** RunAgentInput, the request body. */
pub const RUN_AGENT_INPUT: usize = 64;
/** Message, any role. */
pub const MESSAGE: usize = 42;

pub static DEFS: &[Def] = &[
    // 0
    Union { name: "Event", tag: "type", arms: &[("TEXT_MESSAGE_START", 1), ("TEXT_MESSAGE_CONTENT", 2), ("TEXT_MESSAGE_END", 3), ("TEXT_MESSAGE_CHUNK", 4), ("TOOL_CALL_START", 5), ("TOOL_CALL_ARGS", 6), ("TOOL_CALL_END", 7), ("TOOL_CALL_CHUNK", 8), ("TOOL_CALL_RESULT", 9), ("STATE_SNAPSHOT", 10), ("STATE_DELTA", 11), ("MESSAGES_SNAPSHOT", 12), ("ACTIVITY_SNAPSHOT", 13), ("ACTIVITY_DELTA", 14), ("RAW", 15), ("CUSTOM", 16), ("RUN_STARTED", 17), ("RUN_FINISHED", 18), ("RUN_ERROR", 19), ("STEP_STARTED", 20), ("STEP_FINISHED", 21), ("REASONING_START", 22), ("REASONING_MESSAGE_START", 23), ("REASONING_MESSAGE_CONTENT", 24), ("REASONING_MESSAGE_END", 25), ("REASONING_MESSAGE_CHUNK", 26), ("REASONING_END", 27), ("REASONING_ENCRYPTED_VALUE", 28), ("SUBAGENT_STARTED", 29), ("SUBAGENT_FINISHED", 30), ("SUBAGENT_ERROR", 31)] },
    // 1
    Obj { name: "TextMessageStartEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TEXT_MESSAGE_START"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "role", ty: Enum(&["developer", "system", "assistant", "user"]), req: false },
        Field { name: "name", ty: Str, req: false },
    ] },
    // 2
    Obj { name: "TextMessageContentEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TEXT_MESSAGE_CONTENT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "delta", ty: Str, req: true },
    ] },
    // 3
    Obj { name: "TextMessageEndEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TEXT_MESSAGE_END"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
    ] },
    // 4
    Obj { name: "TextMessageChunkEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TEXT_MESSAGE_CHUNK"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: false },
        Field { name: "role", ty: Enum(&["developer", "system", "assistant", "user"]), req: false },
        Field { name: "delta", ty: Str, req: false },
        Field { name: "name", ty: Str, req: false },
    ] },
    // 5
    Obj { name: "ToolCallStartEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TOOL_CALL_START"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "toolCallId", ty: Str, req: true },
        Field { name: "toolCallName", ty: Str, req: true },
        Field { name: "parentMessageId", ty: Str, req: false },
    ] },
    // 6
    Obj { name: "ToolCallArgsEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TOOL_CALL_ARGS"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "toolCallId", ty: Str, req: true },
        Field { name: "delta", ty: Str, req: true },
    ] },
    // 7
    Obj { name: "ToolCallEndEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TOOL_CALL_END"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "toolCallId", ty: Str, req: true },
    ] },
    // 8
    Obj { name: "ToolCallChunkEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TOOL_CALL_CHUNK"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "toolCallId", ty: Str, req: false },
        Field { name: "toolCallName", ty: Str, req: false },
        Field { name: "parentMessageId", ty: Str, req: false },
        Field { name: "delta", ty: Str, req: false },
    ] },
    // 9
    Obj { name: "ToolCallResultEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("TOOL_CALL_RESULT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "toolCallId", ty: Str, req: true },
        Field { name: "content", ty: Either(&[Str, Arr(&Def(52))]), req: true },
        Field { name: "role", ty: Const("tool"), req: false },
    ] },
    // 10
    Obj { name: "StateSnapshotEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("STATE_SNAPSHOT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "snapshot", ty: Any, req: true },
    ] },
    // 11
    Obj { name: "StateDeltaEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("STATE_DELTA"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "delta", ty: Arr(&Def(65)), req: true },
    ] },
    // 12
    Obj { name: "MessagesSnapshotEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("MESSAGES_SNAPSHOT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "messages", ty: Arr(&Def(42)), req: true },
    ] },
    // 13
    Obj { name: "ActivitySnapshotEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("ACTIVITY_SNAPSHOT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "activityType", ty: Str, req: true },
        Field { name: "content", ty: OpenObj, req: true },
        Field { name: "replace", ty: Bool, req: false },
    ] },
    // 14
    Obj { name: "ActivityDeltaEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("ACTIVITY_DELTA"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "activityType", ty: Str, req: true },
        Field { name: "patch", ty: Arr(&Def(65)), req: true },
    ] },
    // 15
    Obj { name: "RawEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("RAW"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "event", ty: Any, req: true },
        Field { name: "source", ty: Str, req: false },
    ] },
    // 16
    Obj { name: "CustomEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("CUSTOM"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "name", ty: Str, req: true },
        Field { name: "value", ty: Any, req: true },
    ] },
    // 17
    Obj { name: "RunStartedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("RUN_STARTED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "threadId", ty: Str, req: true },
        Field { name: "runId", ty: Str, req: true },
        Field { name: "protocolVersion", ty: Str, req: false },
        Field { name: "parentRunId", ty: Str, req: false },
        Field { name: "input", ty: Def(64), req: false },
    ] },
    // 18
    Obj { name: "RunFinishedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("RUN_FINISHED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "threadId", ty: Str, req: true },
        Field { name: "runId", ty: Str, req: true },
        Field { name: "result", ty: AnyNonNull, req: false },
        Field { name: "outcome", ty: Def(32), req: false },
        Field { name: "usage", ty: Arr(&Def(41)), req: false },
    ] },
    // 19
    Obj { name: "RunErrorEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("RUN_ERROR"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "message", ty: Str, req: true },
        Field { name: "code", ty: Str, req: false },
        Field { name: "usage", ty: Arr(&Def(41)), req: false },
    ] },
    // 20
    Obj { name: "StepStartedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("STEP_STARTED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "stepName", ty: Str, req: true },
    ] },
    // 21
    Obj { name: "StepFinishedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("STEP_FINISHED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "stepName", ty: Str, req: true },
    ] },
    // 22
    Obj { name: "ReasoningStartEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_START"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
    ] },
    // 23
    Obj { name: "ReasoningMessageStartEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_MESSAGE_START"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "role", ty: Const("reasoning"), req: true },
    ] },
    // 24
    Obj { name: "ReasoningMessageContentEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_MESSAGE_CONTENT"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
        Field { name: "delta", ty: Str, req: true },
    ] },
    // 25
    Obj { name: "ReasoningMessageEndEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_MESSAGE_END"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
    ] },
    // 26
    Obj { name: "ReasoningMessageChunkEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_MESSAGE_CHUNK"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: false },
        Field { name: "delta", ty: Str, req: false },
    ] },
    // 27
    Obj { name: "ReasoningEndEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_END"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "messageId", ty: Str, req: true },
    ] },
    // 28
    Obj { name: "ReasoningEncryptedValueEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("REASONING_ENCRYPTED_VALUE"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "subtype", ty: Enum(&["tool-call", "message"]), req: true },
        Field { name: "entityId", ty: Str, req: true },
        Field { name: "encryptedValue", ty: Str, req: true },
    ] },
    // 29
    Obj { name: "SubagentStartedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("SUBAGENT_STARTED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: true },
        Field { name: "name", ty: Str, req: true },
        Field { name: "description", ty: Str, req: false },
        Field { name: "parentSubagentRunId", ty: Str, req: false },
        Field { name: "parentToolCallId", ty: Str, req: false },
        Field { name: "parentMessageId", ty: Str, req: false },
    ] },
    // 30
    Obj { name: "SubagentFinishedEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("SUBAGENT_FINISHED"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: true },
        Field { name: "result", ty: AnyNonNull, req: false },
        Field { name: "outcome", ty: Def(36), req: false },
    ] },
    // 31
    Obj { name: "SubagentErrorEvent", closed: true, fields: &[
        Field { name: "type", ty: Const("SUBAGENT_ERROR"), req: true },
        Field { name: "timestamp", ty: Int(-9007199254740991i64), req: false },
        Field { name: "rawEvent", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "subagentRunId", ty: Str, req: true },
        Field { name: "message", ty: Str, req: true },
        Field { name: "code", ty: Str, req: false },
    ] },
    // 32
    Union { name: "RunFinishedOutcome", tag: "type", arms: &[("success", 33), ("interrupt", 34), ("cancelled", 35)] },
    // 33
    Obj { name: "RunFinishedSuccessOutcome", closed: true, fields: &[
        Field { name: "type", ty: Const("success"), req: true },
        Field { name: "pendingToolCallIds", ty: Arr(&Str), req: false },
    ] },
    // 34
    Obj { name: "RunFinishedInterruptOutcome", closed: true, fields: &[
        Field { name: "type", ty: Const("interrupt"), req: true },
        Field { name: "interrupts", ty: Arr(&Def(39)), req: true },
    ] },
    // 35
    Obj { name: "RunFinishedCancelledOutcome", closed: true, fields: &[
        Field { name: "type", ty: Const("cancelled"), req: true },
    ] },
    // 36
    Union { name: "SubagentFinishedOutcome", tag: "type", arms: &[("success", 37), ("suspended", 38)] },
    // 37
    Obj { name: "SubagentFinishedSuccessOutcome", closed: true, fields: &[
        Field { name: "type", ty: Const("success"), req: true },
    ] },
    // 38
    Obj { name: "SubagentFinishedSuspendedOutcome", closed: true, fields: &[
        Field { name: "type", ty: Const("suspended"), req: true },
        Field { name: "interruptIds", ty: Arr(&Str), req: false },
    ] },
    // 39
    Obj { name: "Interrupt", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "reason", ty: Str, req: true },
        Field { name: "message", ty: Str, req: false },
        Field { name: "toolCallId", ty: Str, req: false },
        Field { name: "responseSchema", ty: OpenObj, req: false },
        Field { name: "expiresAt", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 40
    Obj { name: "ResumeEntry", closed: true, fields: &[
        Field { name: "interruptId", ty: Str, req: true },
        Field { name: "status", ty: Enum(&["resolved", "cancelled"]), req: true },
        Field { name: "payload", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 41
    Obj { name: "TokenUsage", closed: true, fields: &[
        Field { name: "provider", ty: Str, req: false },
        Field { name: "model", ty: Str, req: false },
        Field { name: "inputTokens", ty: Int(0i64), req: false },
        Field { name: "outputTokens", ty: Int(0i64), req: false },
        Field { name: "totalTokens", ty: Int(0i64), req: false },
        Field { name: "reasoningTokens", ty: Int(0i64), req: false },
        Field { name: "cachedInputTokens", ty: Int(0i64), req: false },
        Field { name: "cacheWriteInputTokens", ty: Int(0i64), req: false },
    ] },
    // 42
    Union { name: "Message", tag: "role", arms: &[("developer", 43), ("system", 44), ("assistant", 45), ("user", 46), ("tool", 47), ("activity", 48), ("reasoning", 49)] },
    // 43
    Obj { name: "DeveloperMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("developer"), req: true },
        Field { name: "name", ty: Str, req: false },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "content", ty: Str, req: true },
    ] },
    // 44
    Obj { name: "SystemMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("system"), req: true },
        Field { name: "name", ty: Str, req: false },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "content", ty: Str, req: true },
    ] },
    // 45
    Obj { name: "AssistantMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("assistant"), req: true },
        Field { name: "name", ty: Str, req: false },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "content", ty: Str, req: false },
        Field { name: "toolCalls", ty: Arr(&Def(50)), req: false },
    ] },
    // 46
    Obj { name: "UserMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("user"), req: true },
        Field { name: "name", ty: Str, req: false },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
        Field { name: "content", ty: Either(&[Str, Arr(&Def(52))]), req: true },
    ] },
    // 47
    Obj { name: "ToolMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("tool"), req: true },
        Field { name: "content", ty: Either(&[Str, Arr(&Def(52))]), req: true },
        Field { name: "toolCallId", ty: Str, req: true },
        Field { name: "error", ty: Str, req: false },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 48
    Obj { name: "ActivityMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("activity"), req: true },
        Field { name: "activityType", ty: Str, req: true },
        Field { name: "content", ty: OpenObj, req: true },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 49
    Obj { name: "ReasoningMessage", closed: true, fields: &[
        Field { name: "subagentRunId", ty: Str, req: false },
        Field { name: "id", ty: Str, req: true },
        Field { name: "role", ty: Const("reasoning"), req: true },
        Field { name: "content", ty: Str, req: true },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 50
    Obj { name: "ToolCall", closed: true, fields: &[
        Field { name: "id", ty: Str, req: true },
        Field { name: "type", ty: Const("function"), req: true },
        Field { name: "function", ty: Def(51), req: true },
        Field { name: "encryptedValue", ty: Str, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 51
    Obj { name: "FunctionCall", closed: true, fields: &[
        Field { name: "name", ty: Str, req: true },
        Field { name: "arguments", ty: Str, req: true },
    ] },
    // 52
    Union { name: "ContentPart", tag: "type", arms: &[("text", 53), ("image", 54), ("audio", 55), ("video", 56), ("document", 57)] },
    // 53
    Obj { name: "TextPart", closed: true, fields: &[
        Field { name: "type", ty: Const("text"), req: true },
        Field { name: "id", ty: Str, req: false },
        Field { name: "text", ty: Str, req: true },
        Field { name: "metadata", ty: AnyNonNull, req: false },
    ] },
    // 54
    Obj { name: "ImagePart", closed: true, fields: &[
        Field { name: "type", ty: Const("image"), req: true },
        Field { name: "id", ty: Str, req: false },
        Field { name: "source", ty: Def(58), req: true },
        Field { name: "metadata", ty: AnyNonNull, req: false },
    ] },
    // 55
    Obj { name: "AudioPart", closed: true, fields: &[
        Field { name: "type", ty: Const("audio"), req: true },
        Field { name: "id", ty: Str, req: false },
        Field { name: "source", ty: Def(58), req: true },
        Field { name: "metadata", ty: AnyNonNull, req: false },
    ] },
    // 56
    Obj { name: "VideoPart", closed: true, fields: &[
        Field { name: "type", ty: Const("video"), req: true },
        Field { name: "id", ty: Str, req: false },
        Field { name: "source", ty: Def(58), req: true },
        Field { name: "metadata", ty: AnyNonNull, req: false },
    ] },
    // 57
    Obj { name: "DocumentPart", closed: true, fields: &[
        Field { name: "type", ty: Const("document"), req: true },
        Field { name: "id", ty: Str, req: false },
        Field { name: "source", ty: Def(58), req: true },
        Field { name: "metadata", ty: AnyNonNull, req: false },
    ] },
    // 58
    Union { name: "PartSource", tag: "type", arms: &[("data", 59), ("url", 60), ("file", 61)] },
    // 59
    Obj { name: "DataSource", closed: true, fields: &[
        Field { name: "type", ty: Const("data"), req: true },
        Field { name: "value", ty: Str, req: true },
        Field { name: "mimeType", ty: Str, req: true },
    ] },
    // 60
    Obj { name: "UrlSource", closed: true, fields: &[
        Field { name: "type", ty: Const("url"), req: true },
        Field { name: "value", ty: Str, req: true },
        Field { name: "mimeType", ty: Str, req: false },
    ] },
    // 61
    Obj { name: "FileSource", closed: true, fields: &[
        Field { name: "type", ty: Const("file"), req: true },
        Field { name: "value", ty: Str, req: true },
        Field { name: "provider", ty: Str, req: false },
        Field { name: "mimeType", ty: Str, req: false },
    ] },
    // 62
    Obj { name: "Context", closed: true, fields: &[
        Field { name: "description", ty: Str, req: true },
        Field { name: "value", ty: Str, req: true },
    ] },
    // 63
    Obj { name: "Tool", closed: true, fields: &[
        Field { name: "name", ty: Str, req: true },
        Field { name: "description", ty: Str, req: true },
        Field { name: "parameters", ty: AnyNonNull, req: false },
        Field { name: "metadata", ty: OpenObj, req: false },
    ] },
    // 64
    Obj { name: "RunAgentInput", closed: true, fields: &[
        Field { name: "threadId", ty: Str, req: true },
        Field { name: "runId", ty: Str, req: true },
        Field { name: "protocolVersion", ty: Str, req: false },
        Field { name: "parentRunId", ty: Str, req: false },
        Field { name: "state", ty: AnyNonNull, req: false },
        Field { name: "messages", ty: Arr(&Def(42)), req: true },
        Field { name: "tools", ty: Arr(&Def(63)), req: false },
        Field { name: "context", ty: Arr(&Def(62)), req: false },
        Field { name: "forwardedProps", ty: AnyNonNull, req: false },
        Field { name: "resume", ty: Arr(&Def(40)), req: false },
    ] },
    // 65
    Union { name: "JsonPatchOperation", tag: "op", arms: &[("add", 66), ("remove", 67), ("replace", 68), ("move", 69), ("copy", 70), ("test", 71)] },
    // 66
    Obj { name: "AddOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("add"), req: true },
        Field { name: "path", ty: Pointer, req: true },
        Field { name: "value", ty: Any, req: true },
    ] },
    // 67
    Obj { name: "RemoveOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("remove"), req: true },
        Field { name: "path", ty: Pointer, req: true },
    ] },
    // 68
    Obj { name: "ReplaceOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("replace"), req: true },
        Field { name: "path", ty: Pointer, req: true },
        Field { name: "value", ty: Any, req: true },
    ] },
    // 69
    Obj { name: "MoveOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("move"), req: true },
        Field { name: "from", ty: Pointer, req: true },
        Field { name: "path", ty: Pointer, req: true },
    ] },
    // 70
    Obj { name: "CopyOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("copy"), req: true },
        Field { name: "from", ty: Pointer, req: true },
        Field { name: "path", ty: Pointer, req: true },
    ] },
    // 71
    Obj { name: "TestOperation", closed: false, fields: &[
        Field { name: "op", ty: Const("test"), req: true },
        Field { name: "path", ty: Pointer, req: true },
        Field { name: "value", ty: Any, req: true },
    ] },
];
