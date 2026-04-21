import { describe, expect, test } from "bun:test"
import type {
  AssistantMessage,
  ReasoningPart,
  StepFinishPart,
  StepStartPart,
  TextPart,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2"
import { createSessionTranscript, type SessionTranscriptMap } from "../../src/lib/opencode/messages"
import type { TreeSnapshot } from "../../src/lib/storage"
import { buildFlatRows } from "../../src/lib/tree/flatten"
import { projectSessionTree } from "../../src/lib/tree/project"

function createUserMessage(id: string, sessionID: string, created: number): UserMessage {
  return {
    id,
    sessionID,
    role: "user",
    time: { created },
    agent: "test-agent",
    model: {
      providerID: "test-provider",
      modelID: "test-model",
    },
  }
}

function createAssistantMessage(id: string, sessionID: string, created: number, parentID = "msg_parent"): AssistantMessage {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created, completed: created + 1 },
    parentID,
    modelID: "test-model",
    providerID: "test-provider",
    mode: "default",
    agent: "test-agent",
    path: {
      cwd: "/repo",
      root: "/repo",
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  }
}

function createTextPart(messageID: string, sessionID: string, text: string): TextPart {
  return {
    id: `${messageID}_text`,
    sessionID,
    messageID,
    type: "text",
    text,
  }
}

function createToolPart(messageID: string, sessionID: string, tool: string, input: Record<string, unknown>): ToolPart {
  return {
    id: `${messageID}_tool`,
    sessionID,
    messageID,
    type: "tool",
    callID: `${messageID}_call`,
    tool,
    state: {
      status: "completed",
      input,
      output: "ok",
      title: tool,
      metadata: {},
      time: {
        start: 1,
        end: 2,
      },
    },
  }
}

function createReasoningPart(messageID: string, sessionID: string, text: string): ReasoningPart {
  return {
    id: `${messageID}_reasoning`,
    sessionID,
    messageID,
    type: "reasoning",
    text,
    time: {
      start: 1,
      end: 2,
    },
  }
}

function createStepStartPart(messageID: string, sessionID: string): StepStartPart {
  return {
    id: `${messageID}_step_start`,
    sessionID,
    messageID,
    type: "step-start",
  }
}

function createStepFinishPart(messageID: string, sessionID: string): StepFinishPart {
  return {
    id: `${messageID}_step_finish`,
    sessionID,
    messageID,
    type: "step-finish",
    reason: "done",
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  }
}

function createRootSnapshot(): TreeSnapshot {
  return {
    version: 1,
    treeId: "tree_01",
    rootSessionId: "sess_root",
    sessions: {
      sess_root: {
        sessionId: "sess_root",
        parentSessionId: null,
        anchorMessageId: null,
        children: [],
      },
    },
  }
}

describe("buildFlatRows preview", () => {
  test("summarizes assistant tool input on one line", () => {
    const transcripts: SessionTranscriptMap = {
      sess_root: createSessionTranscript({
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createAssistantMessage("msg_tool", "sess_root", 10),
            parts: [
              createStepStartPart("msg_tool", "sess_root"),
              createToolPart("msg_tool", "sess_root", "bash", {
                command: "printf 'a\\n b'",
                timeout: 120,
              }),
              createStepFinishPart("msg_tool", "sess_root"),
            ],
          },
        ],
      }),
    }

    const rows = buildFlatRows(projectSessionTree(createRootSnapshot(), transcripts), "sess_root").rows
    const toolRow = rows[1]

    expect(toolRow).toBeDefined()
    expect(toolRow).toMatchObject({
      kind: "message",
    })

    if (!toolRow || toolRow.kind !== "message") {
      throw new Error("expected message row")
    }

    expect(toolRow.preview).toStartWith("tool:bash command=printf 'a")
    expect(toolRow.preview).not.toContain("\n")
  })

  test("falls back to reasoning text when assistant has no text or tool", () => {
    const transcripts: SessionTranscriptMap = {
      sess_root: createSessionTranscript({
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createAssistantMessage("msg_reasoning", "sess_root", 10),
            parts: [
              createStepStartPart("msg_reasoning", "sess_root"),
              createReasoningPart("msg_reasoning", "sess_root", "Need inspect tree route before moving focus."),
              createStepFinishPart("msg_reasoning", "sess_root"),
            ],
          },
        ],
      }),
    }

    const rows = buildFlatRows(projectSessionTree(createRootSnapshot(), transcripts), "sess_root").rows
    const reasoningRow = rows[1]

    expect(reasoningRow).toMatchObject({
      kind: "message",
      preview: "reasoning: Need inspect tree route before moving focus.",
    })
  })

  test("keeps user preview from visible text parts", () => {
    const transcripts: SessionTranscriptMap = {
      sess_root: createSessionTranscript({
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createUserMessage("msg_user", "sess_root", 10),
            parts: [createTextPart("msg_user", "sess_root", "hello from user prompt")],
          },
        ],
      }),
    }

    const rows = buildFlatRows(projectSessionTree(createRootSnapshot(), transcripts), "sess_root").rows
    expect(rows[1]).toMatchObject({
      kind: "message",
      preview: "hello from user prompt",
    })
  })
})
