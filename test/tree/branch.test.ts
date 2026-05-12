import { describe, expect, test } from "bun:test";
import type { AssistantMessage, TextPart, UserMessage } from "@opencode-ai/sdk/v2";
import {
  createSessionTranscript,
  type SessionTranscriptMap,
} from "../../src/lib/opencode/messages";
import { collectTreeBranchSummarySlice, planTreeBranchAction } from "../../src/lib/tree/branch";
import type { TreeFlatRow } from "../../src/lib/tree/flatten";

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
  };
}

function createAssistantMessage(
  id: string,
  sessionID: string,
  created: number,
  parentID = "msg_user",
): AssistantMessage {
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
  };
}

function createTextPart(messageID: string, sessionID: string, text: string): TextPart {
  return {
    id: `${messageID}_text`,
    sessionID,
    messageID,
    type: "text",
    text,
  };
}

function createMessageRow(input: {
  sessionId: string;
  currentSessionId: string;
  messageId: string;
  role: "user" | "assistant";
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
  };
}

const transcripts: SessionTranscriptMap = {
  sess_root: createSessionTranscript({
    sessionId: "sess_root",
    status: "available",
    messages: [
      {
        info: createUserMessage("msg_user", "sess_root", 10),
        parts: [createTextPart("msg_user", "sess_root", "hello branch")],
      },
      {
        info: createAssistantMessage("msg_assistant", "sess_root", 20),
        parts: [createTextPart("msg_assistant", "sess_root", "assistant reply")],
      },
      {
        info: createUserMessage("msg_after", "sess_root", 30),
        parts: [createTextPart("msg_after", "sess_root", "after reply")],
      },
    ],
  }),
  sess_leaf: createSessionTranscript({
    sessionId: "sess_leaf",
    status: "available",
    messages: [
      {
        info: createUserMessage("msg_leaf_user", "sess_leaf", 10),
        parts: [createTextPart("msg_leaf_user", "sess_leaf", "leaf user")],
      },
      {
        info: createAssistantMessage("msg_leaf_last", "sess_leaf", 20, "msg_leaf_user"),
        parts: [createTextPart("msg_leaf_last", "sess_leaf", "leaf assistant")],
      },
    ],
  }),
};

describe("planTreeBranchAction", () => {
  test("forks user message at selected message and replays text", () => {
    expect(
      planTreeBranchAction({
        row: createMessageRow({
          sessionId: "sess_root",
          currentSessionId: "sess_root",
          messageId: "msg_user",
          role: "user",
        }),
        transcripts,
      }),
    ).toEqual({
      kind: "fork",
      plan: {
        sessionId: "sess_root",
        anchorMessageId: "msg_user",
        forkMessageId: "msg_user",
        appendPromptText: "hello branch",
      },
    });
  });

  test("forks assistant message from next message so selected assistant stays visible", () => {
    expect(
      planTreeBranchAction({
        row: createMessageRow({
          sessionId: "sess_root",
          currentSessionId: "sess_root",
          messageId: "msg_assistant",
          role: "assistant",
        }),
        transcripts,
      }),
    ).toEqual({
      kind: "fork",
      plan: {
        sessionId: "sess_root",
        anchorMessageId: "msg_assistant",
        forkMessageId: "msg_after",
      },
    });
  });

  test("switches to session when assistant is last message", () => {
    expect(
      planTreeBranchAction({
        row: createMessageRow({
          sessionId: "sess_leaf",
          currentSessionId: "sess_root",
          messageId: "msg_leaf_last",
          role: "assistant",
        }),
        transcripts,
      }),
    ).toEqual({
      kind: "switch-session",
      sessionId: "sess_leaf",
    });
  });

  test("switches to live session when session row is selected", () => {
    expect(
      planTreeBranchAction({
        row: {
          kind: "session",
          id: "session:sess_root",
          depth: 0,
          sessionId: "sess_root",
          currentSessionId: "sess_leaf",
          title: "sess_root",
          isDeleted: false,
          isCollapsible: true,
          isCollapsed: false,
        },
        transcripts,
      }),
    ).toEqual({
      kind: "switch-session",
      sessionId: "sess_root",
    });
  });

  test("does nothing for deleted session rows", () => {
    expect(
      planTreeBranchAction({
        row: {
          kind: "session",
          id: "session:sess_deleted",
          depth: 0,
          sessionId: "sess_deleted",
          currentSessionId: "sess_root",
          title: "sess_deleted",
          isDeleted: true,
          isCollapsible: false,
          isCollapsed: false,
        },
        transcripts,
      }),
    ).toEqual({
      kind: "noop",
    });
  });
});

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
    });

    expect(slice.sessionId).toBe("sess_root");
    expect(slice.startMessageId).toBe("msg_assistant");
    expect(slice.messages.map((message) => message.info.id)).toEqual([
      "msg_assistant",
      "msg_after",
    ]);
  });

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
          isCollapsible: true,
          isCollapsed: false,
        },
        transcripts,
      }),
    ).toThrow("Select a message row to summarize.");
  });

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
    ).toThrow("Message msg_missing is unavailable.");
  });
});
