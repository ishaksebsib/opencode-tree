import { describe, expect, test } from "bun:test";
import type { AssistantMessage, TextPart, UserMessage } from "@opencode-ai/sdk/v2";
import { createSessionTranscript, type SessionTranscriptMap } from "../../src/lib/opencode/messages";
import type { TreeSnapshot } from "../../src/lib/storage";
import { buildFlatRows } from "../../src/lib/tree/flatten";
import { resolveVisibleSelectionRowId } from "../../src/lib/tree/navigation";
import { projectSessionTree } from "../../src/lib/tree/project";
import { buildVisibleTree } from "../../src/lib/tree/visible";

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

function createSnapshot(): TreeSnapshot {
  return {
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
  };
}

function createTranscripts(): SessionTranscriptMap {
  return {
    sess_root: createSessionTranscript({
      sessionId: "sess_root",
      status: "available",
      messages: [
        {
          info: createUserMessage("msg_anchor", "sess_root", 10),
          parts: [createTextPart("msg_anchor", "sess_root", "anchor")],
        },
        {
          info: createAssistantMessage("msg_after", "sess_root", 20, "msg_anchor"),
          parts: [createTextPart("msg_after", "sess_root", "after")],
        },
      ],
    }),
    sess_child: createSessionTranscript({
      sessionId: "sess_child",
      status: "available",
      messages: [
        {
          info: createUserMessage("msg_child", "sess_child", 30),
          parts: [createTextPart("msg_child", "sess_child", "child")],
        },
      ],
    }),
  };
}

describe("buildVisibleTree", () => {
  test("hides collapsed session descendants while keeping the session row", () => {
    const projectedTree = projectSessionTree(createSnapshot(), createTranscripts());
    const visibleTree = buildVisibleTree(projectedTree, {
      collapsedSessionIds: new Set(["sess_child"]),
    });
    const rows = buildFlatRows(visibleTree.root, "sess_root").rows;

    expect(rows.map((row) => row.id)).toEqual([
      "session:sess_root",
      "message:sess_root:msg_anchor",
      "session:sess_child",
      "message:sess_root:msg_after",
    ]);
    expect(rows[2]).toMatchObject({
      kind: "session",
      sessionId: "sess_child",
      isCollapsible: true,
      isCollapsed: true,
    });
  });

  test("indexes hidden descendants so selection can recover to visible ancestor", () => {
    const projectedTree = projectSessionTree(createSnapshot(), createTranscripts());
    const visibleTree = buildVisibleTree(projectedTree, {
      collapsedSessionIds: new Set(["sess_child"]),
    });
    const flatTree = buildFlatRows(visibleTree.root, "sess_root");

    expect(
      resolveVisibleSelectionRowId({
        flatTree,
        currentSessionId: "sess_root",
        parentRowIdById: visibleTree.parentRowIdById,
        preferredRowId: "message:sess_child:msg_child",
      }),
    ).toBe("session:sess_child");
  });
});
