import { describe, expect, test } from "bun:test"
import type { Message, Part, UserMessage } from "@opencode-ai/sdk/v2"
import {
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
