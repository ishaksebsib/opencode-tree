import { describe, expect, test } from "bun:test"
import type { Message, Part, UserMessage } from "@opencode-ai/sdk/v2"
import {
  getMessageTextReplay,
  getNextSessionMessageRecord,
  getSessionMessageRecord,
  loadSessionTranscript,
  loadSnapshotSessionTranscripts,
  type SessionMessageRecord,
} from "../../src/lib/opencode/messages"
import type { TreeSnapshot } from "../../src/lib/storage"

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

function createMessageRecord(id: string, sessionID: string, created: number): SessionMessageRecord {
  return {
    info: createUserMessage(id, sessionID, created),
    parts: [],
  }
}

describe("loadSessionTranscript", () => {
  test("loads all transcript pages and returns messages in chronological order", async () => {
    const calls: Array<{ sessionId: string; before?: string; limit: number }> = []

    const transcript = await loadSessionTranscript(
      "sess_root",
      async (input) => {
        calls.push(input)

        if (!input.before) {
          return {
            items: [
              createMessageRecord("msg_03", "sess_root", 30),
              createMessageRecord("msg_04", "sess_root", 40),
            ],
            nextCursor: "cursor_01",
          }
        }

        return {
          items: [
            createMessageRecord("msg_01", "sess_root", 10),
            createMessageRecord("msg_02", "sess_root", 20),
          ],
        }
      },
      2,
    )

    expect(calls).toEqual([
      { sessionId: "sess_root", before: undefined, limit: 2 },
      { sessionId: "sess_root", before: "cursor_01", limit: 2 },
    ])

    expect(transcript).toEqual({
      sessionId: "sess_root",
      messages: [
        createMessageRecord("msg_01", "sess_root", 10),
        createMessageRecord("msg_02", "sess_root", 20),
        createMessageRecord("msg_03", "sess_root", 30),
        createMessageRecord("msg_04", "sess_root", 40),
      ],
    })
  })
})

describe("message helpers", () => {
  test("finds current and next session messages", async () => {
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

    const transcripts = await loadSnapshotSessionTranscripts(snapshot, async (sessionId) => ({
      sessionId,
      messages: [createMessageRecord("msg_01", sessionId, 1), createMessageRecord("msg_02", sessionId, 2)],
    }))

    expect(getSessionMessageRecord(transcripts, "sess_root", "msg_01")).toEqual(createMessageRecord("msg_01", "sess_root", 1))
    expect(getNextSessionMessageRecord(transcripts, "sess_root", "msg_01")).toEqual(createMessageRecord("msg_02", "sess_root", 2))
    expect(getNextSessionMessageRecord(transcripts, "sess_root", "msg_02")).toBeUndefined()
  })

  test("extracts text-only prompt replay", () => {
    const parts: Part[] = [
      {
        id: "part_1",
        sessionID: "sess_root",
        messageID: "msg_01",
        type: "text",
        text: "hello",
      },
      {
        id: "part_2",
        sessionID: "sess_root",
        messageID: "msg_01",
        type: "text",
        text: " world",
        synthetic: true,
      },
      {
        id: "part_3",
        sessionID: "sess_root",
        messageID: "msg_01",
        type: "text",
        text: " there",
      },
    ]

    expect(getMessageTextReplay(parts)).toBe("hello there")
  })
})

describe("loadSnapshotSessionTranscripts", () => {
  test("loads all snapshot session ids", async () => {
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
          anchorMessageId: "msg_01",
          children: [],
        },
      },
    }

    const loaded = await loadSnapshotSessionTranscripts(snapshot, async (sessionId) => ({
      sessionId,
      messages: [createMessageRecord(`msg_${sessionId}`, sessionId, 1)],
    }))

    expect(loaded).toEqual({
      sess_child: {
        sessionId: "sess_child",
        messages: [createMessageRecord("msg_sess_child", "sess_child", 1)],
      },
      sess_root: {
        sessionId: "sess_root",
        messages: [createMessageRecord("msg_sess_root", "sess_root", 1)],
      },
    })
  })
})
