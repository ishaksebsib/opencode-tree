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
import type { SessionTranscript, SessionTranscriptMap } from "../../src/lib/opencode/messages"
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
    id: `${messageID}_part`,
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

function createTranscript(
  sessionId: string,
  messages: Array<{ id: string; created: number; text: string }>,
): SessionTranscript {
  return {
    sessionId,
    status: "available",
    messages: messages.map((message) => ({
      info: createUserMessage(message.id, sessionId, message.created),
      parts: [createTextPart(message.id, sessionId, message.text)],
    })),
  }
}

describe("projectSessionTree", () => {
  test("inserts child session rows immediately after anchor message", () => {
    const snapshot: TreeSnapshot = {
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_child"],
        },
        sess_child: {
          sessionId: "sess_child",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_anchor",
          children: [],
        },
      },
    }

    const transcripts: SessionTranscriptMap = {
      sess_root: createTranscript("sess_root", [
        { id: "msg_anchor", created: 10, text: "anchor prompt" },
        { id: "msg_after", created: 20, text: "later prompt" },
      ]),
      sess_child: createTranscript("sess_child", [{ id: "msg_child", created: 30, text: "branch prompt" }]),
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_child").rows

    expect(rows.map((row) => row.id)).toEqual([
      "session:sess_root",
      "message:sess_root:msg_anchor",
      "session:sess_child",
      "message:sess_child:msg_child",
      "message:sess_root:msg_after",
    ])
  })

  test("keeps sibling branch order from snapshot children array", () => {
    const snapshot: TreeSnapshot = {
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_child_b", "sess_child_a"],
        },
        sess_child_a: {
          sessionId: "sess_child_a",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_anchor",
          children: [],
        },
        sess_child_b: {
          sessionId: "sess_child_b",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_anchor",
          children: [],
        },
      },
    }

    const transcripts: SessionTranscriptMap = {
      sess_root: createTranscript("sess_root", [{ id: "msg_anchor", created: 10, text: "anchor prompt" }]),
      sess_child_a: createTranscript("sess_child_a", [{ id: "msg_a", created: 20, text: "branch a" }]),
      sess_child_b: createTranscript("sess_child_b", [{ id: "msg_b", created: 15, text: "branch b" }]),
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_root").rows

    expect(rows.map((row) => row.id)).toEqual([
      "session:sess_root",
      "message:sess_root:msg_anchor",
      "session:sess_child_b",
      "message:sess_child_b:msg_b",
      "session:sess_child_a",
      "message:sess_child_a:msg_a",
    ])
  })

  test("hides inherited prefix for user-anchored child sessions", () => {
    const snapshot: TreeSnapshot = {
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_child"],
        },
        sess_child: {
          sessionId: "sess_child",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_anchor",
          children: [],
        },
      },
    }

    const transcripts: SessionTranscriptMap = {
      sess_root: {
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createUserMessage("msg_hello", "sess_root", 10),
            parts: [createTextPart("msg_hello", "sess_root", "hello")],
          },
          {
            info: createAssistantMessage("msg_reply", "sess_root", 20, "msg_hello"),
            parts: [createTextPart("msg_reply", "sess_root", "hi there")],
          },
          {
            info: createUserMessage("msg_anchor", "sess_root", 30),
            parts: [createTextPart("msg_anchor", "sess_root", "how are you doing")],
          },
          {
            info: createAssistantMessage("msg_after", "sess_root", 40, "msg_anchor"),
            parts: [createTextPart("msg_after", "sess_root", "doing well")],
          },
        ],
      },
      sess_child: {
        sessionId: "sess_child",
        status: "available",
        messages: [
          {
            info: createUserMessage("msg_clone_1", "sess_child", 10),
            parts: [createTextPart("msg_clone_1", "sess_child", "hello")],
          },
          {
            info: createAssistantMessage("msg_clone_2", "sess_child", 20, "msg_clone_1"),
            parts: [createTextPart("msg_clone_2", "sess_child", "hi there")],
          },
          {
            info: createUserMessage("msg_branch_user", "sess_child", 50),
            parts: [createTextPart("msg_branch_user", "sess_child", "i'm fine how are you")],
          },
          {
            info: createAssistantMessage("msg_branch_reply", "sess_child", 60, "msg_branch_user"),
            parts: [createTextPart("msg_branch_reply", "sess_child", "I'm doing well too")],
          },
        ],
      },
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_child").rows

    expect(rows.map((row) => row.id)).toEqual([
      "session:sess_root",
      "message:sess_root:msg_hello",
      "message:sess_root:msg_reply",
      "message:sess_root:msg_anchor",
      "session:sess_child",
      "message:sess_child:msg_branch_user",
      "message:sess_child:msg_branch_reply",
      "message:sess_root:msg_after",
    ])
  })

  test("hides inherited prefix through assistant anchor for assistant-anchored child sessions", () => {
    const snapshot: TreeSnapshot = {
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_child"],
        },
        sess_child: {
          sessionId: "sess_child",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_anchor_assistant",
          children: [],
        },
      },
    }

    const transcripts: SessionTranscriptMap = {
      sess_root: {
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createUserMessage("msg_user", "sess_root", 10),
            parts: [createTextPart("msg_user", "sess_root", "hello")],
          },
          {
            info: createAssistantMessage("msg_anchor_assistant", "sess_root", 20, "msg_user"),
            parts: [createTextPart("msg_anchor_assistant", "sess_root", "assistant anchor")],
          },
          {
            info: createUserMessage("msg_after_user", "sess_root", 30),
            parts: [createTextPart("msg_after_user", "sess_root", "follow up")],
          },
        ],
      },
      sess_child: {
        sessionId: "sess_child",
        status: "available",
        messages: [
          {
            info: createUserMessage("msg_clone_user", "sess_child", 10),
            parts: [createTextPart("msg_clone_user", "sess_child", "hello")],
          },
          {
            info: createAssistantMessage("msg_clone_assistant", "sess_child", 20, "msg_clone_user"),
            parts: [createTextPart("msg_clone_assistant", "sess_child", "assistant anchor")],
          },
          {
            info: createUserMessage("msg_branch_user", "sess_child", 40),
            parts: [createTextPart("msg_branch_user", "sess_child", "new path")],
          },
        ],
      },
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_child").rows

    expect(rows.map((row) => row.id)).toEqual([
      "session:sess_root",
      "message:sess_root:msg_user",
      "message:sess_root:msg_anchor_assistant",
      "session:sess_child",
      "message:sess_child:msg_branch_user",
      "message:sess_root:msg_after_user",
    ])
  })

  test("uses assistant tool preview when no visible text exists", () => {
    const snapshot: TreeSnapshot = {
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

    const transcripts: SessionTranscriptMap = {
      sess_root: {
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createAssistantMessage("msg_tool", "sess_root", 10),
            parts: [
              createStepStartPart("msg_tool", "sess_root"),
              createToolPart("msg_tool", "sess_root", "bash", {
                command: "rg -n session.messages src",
                timeout: 120,
              }),
              createStepFinishPart("msg_tool", "sess_root"),
            ],
          },
        ],
      },
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_root").rows
    const toolRow = rows[1]

    expect(toolRow).toMatchObject({
      kind: "message",
      preview: "tool:bash command=rg -n session.messages src",
    })
  })

  test("uses reasoning preview when assistant message has no text or tool", () => {
    const snapshot: TreeSnapshot = {
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

    const transcripts: SessionTranscriptMap = {
      sess_root: {
        sessionId: "sess_root",
        status: "available",
        messages: [
          {
            info: createAssistantMessage("msg_reasoning", "sess_root", 10),
            parts: [
              createStepStartPart("msg_reasoning", "sess_root"),
              createReasoningPart("msg_reasoning", "sess_root", "Need inspect pagination API before projection."),
              createStepFinishPart("msg_reasoning", "sess_root"),
            ],
          },
        ],
      },
    }

    const rows = buildFlatRows(projectSessionTree(snapshot, transcripts), "sess_root").rows
    const reasoningRow = rows[1]

    expect(reasoningRow).toMatchObject({
      kind: "message",
      preview: "reasoning: Need inspect pagination API before projection.",
    })
  })
})
