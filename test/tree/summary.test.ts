import { describe, expect, test } from "bun:test"
import type { AssistantMessage, FilePart, ReasoningPart, TextPart, ToolPart, UserMessage } from "@opencode-ai/sdk/v2"
import {
  createSessionTranscript,
  serializeSessionMessageRecordsForSummary,
  type SessionTranscriptMap,
} from "../../src/lib/opencode/messages"
import { collectTreeBranchSummarySlice } from "../../src/lib/tree/branch"
import type { TreeFlatRow } from "../../src/lib/tree/flatten"

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

function createAssistantMessage(id: string, sessionID: string, created: number, parentID = "msg_user"): AssistantMessage {
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

function createMessageRow(input: {
  sessionId: string
  currentSessionId: string
  messageId: string
  role: "user" | "assistant"
}): TreeFlatRow {
  return {
    kind: "message",
    id: `message:${input.sessionId}:${input.messageId}`,
    depth: 1,
    sessionId: input.sessionId,
    currentSessionId: input.currentSessionId,
    messageId: input.messageId,
    role: input.role,
    preview: input.role,
  }
}

function createTextPart(messageID: string, sessionID: string, text: string, input: { synthetic?: boolean; ignored?: boolean } = {}): TextPart {
  return {
    id: `${messageID}_text_${text.length}`,
    sessionID,
    messageID,
    type: "text",
    text,
    synthetic: input.synthetic,
    ignored: input.ignored,
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
    },
  }
}

function createToolPart(messageID: string, sessionID: string): ToolPart {
  return {
    id: `${messageID}_tool`,
    sessionID,
    messageID,
    type: "tool",
    callID: `${messageID}_call`,
    tool: "read",
    state: {
      status: "completed",
      input: {
        path: "src/app.ts",
        line: 3,
      },
      output: "file contents",
      title: "Read file",
      metadata: {},
      time: {
        start: 1,
        end: 2,
      },
    },
  }
}

function createFilePart(messageID: string, sessionID: string, path: string): FilePart {
  return {
    id: `${messageID}_file`,
    sessionID,
    messageID,
    type: "file",
    mime: "text/plain",
    url: `file://${path}`,
    source: {
      type: "file",
      path,
      text: {
        value: path,
        start: 0,
        end: path.length,
      },
    },
  }
}

const transcripts: SessionTranscriptMap = {
  sess_root: createSessionTranscript({
    sessionId: "sess_root",
    status: "available",
    messages: [
      {
        info: createUserMessage("msg_user", "sess_root", 10),
        parts: [createTextPart("msg_user", "sess_root", "start here")],
      },
      {
        info: createAssistantMessage("msg_assistant", "sess_root", 20),
        parts: [
          createReasoningPart("msg_assistant", "sess_root", "compare two options"),
          createTextPart("msg_assistant", "sess_root", "I checked the file."),
          createToolPart("msg_assistant", "sess_root"),
          createFilePart("msg_assistant", "sess_root", "src/app.ts"),
        ],
      },
      {
        info: createUserMessage("msg_followup", "sess_root", 30),
        parts: [
          createTextPart("msg_followup", "sess_root", "ignored", { synthetic: true }),
          createTextPart("msg_followup", "sess_root", "ship it"),
        ],
      },
    ],
  }),
}

describe("collectTreeBranchSummarySlice", () => {
  test("collects messages from selected row through session end", () => {
    const slice = collectTreeBranchSummarySlice({
      row: createMessageRow({
        sessionId: "sess_root",
        currentSessionId: "sess_root",
        messageId: "msg_assistant",
        role: "assistant",
      }),
      transcripts,
    })

    expect(slice.sessionId).toBe("sess_root")
    expect(slice.startMessageId).toBe("msg_assistant")
    expect(slice.messages.map((message) => message.info.id)).toEqual(["msg_assistant", "msg_followup"])
  })

  test("rejects non-message rows", () => {
    expect(() =>
      collectTreeBranchSummarySlice({
        row: {
          kind: "session",
          id: "session:sess_root",
          depth: 0,
          sessionId: "sess_root",
          currentSessionId: "sess_root",
          title: "sess_root",
          isDeleted: false,
        },
        transcripts,
      }),
    ).toThrow("Select a message row to summarize.")
  })

  test("rejects missing transcript messages", () => {
    expect(() =>
      collectTreeBranchSummarySlice({
        row: createMessageRow({
          sessionId: "sess_root",
          currentSessionId: "sess_root",
          messageId: "msg_missing",
          role: "user",
        }),
        transcripts,
      }),
    ).toThrow("Message msg_missing is unavailable.")
  })
})

describe("serializeSessionMessageRecordsForSummary", () => {
  test("serializes selected session tail into summary-safe text", () => {
    const slice = collectTreeBranchSummarySlice({
      row: createMessageRow({
        sessionId: "sess_root",
        currentSessionId: "sess_root",
        messageId: "msg_assistant",
        role: "assistant",
      }),
      transcripts,
    })

    expect(serializeSessionMessageRecordsForSummary(slice.messages)).toBe(
      [
        "[Assistant reasoning]: compare two options",
        "[Assistant]: I checked the file.",
        "[Assistant tool calls]: read(path=\"src/app.ts\", line=3)",
        "[Assistant files]: src/app.ts",
        "",
        "[User]: ship it",
      ].join("\n"),
    )
  })
})
