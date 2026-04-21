import { describe, expect, test } from "bun:test"
import type { OpencodeClient, Part, UserMessage } from "@opencode-ai/sdk/v2"
import {
  createSessionTranscript,
  createSessionMessagesPageLoader,
  getMessageTextReplay,
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
            status: "available",
            items: [
              createMessageRecord("msg_03", "sess_root", 30),
              createMessageRecord("msg_04", "sess_root", 40),
            ],
            nextCursor: "cursor_01",
          }
        }

        return {
          status: "available",
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
      status: "available",
      messages: [
        createMessageRecord("msg_01", "sess_root", 10),
        createMessageRecord("msg_02", "sess_root", 20),
        createMessageRecord("msg_03", "sess_root", 30),
        createMessageRecord("msg_04", "sess_root", 40),
      ],
      messageById: new Map([
        ["msg_01", createMessageRecord("msg_01", "sess_root", 10)],
        ["msg_02", createMessageRecord("msg_02", "sess_root", 20)],
        ["msg_03", createMessageRecord("msg_03", "sess_root", 30)],
        ["msg_04", createMessageRecord("msg_04", "sess_root", 40)],
      ]),
      messageIndexById: new Map([
        ["msg_01", 0],
        ["msg_02", 1],
        ["msg_03", 2],
        ["msg_04", 3],
      ]),
    })
  })

  test("returns deleted transcript when loader reports missing session", async () => {
    const transcript = await loadSessionTranscript("sess_deleted", async () => ({
      status: "deleted",
      items: [],
    }))

    expect(transcript).toEqual(createSessionTranscript({ sessionId: "sess_deleted", status: "deleted", messages: [] }))
  })
})

function createMessagesResult(input: {
  status: number
  data?: Array<{ info: UserMessage; parts: Part[] }>
  error?: unknown
  nextCursor?: string
}) {
  const headers = new Headers()
  if (input.nextCursor) {
    headers.set("x-next-cursor", input.nextCursor)
  }

  return {
    data: input.data,
    error: input.error,
    request: new Request("http://localhost/session/test/message"),
    response: new Response(null, { status: input.status, headers }),
  }
}

function createMessagesClient(result: ReturnType<typeof createMessagesResult>): OpencodeClient {
  return {
    session: {
      messages: async () => result,
    },
  } as unknown as OpencodeClient
}


describe("createSessionMessagesPageLoader", () => {
  test("treats 404 session message responses as deleted sessions", async () => {
    const loadPage = createSessionMessagesPageLoader(
      createMessagesClient(
        createMessagesResult({
          status: 404,
          error: {
            name: "NotFoundError",
            data: {
              message: "Session not found",
            },
          },
        }),
      ),
    )

    await expect(loadPage({ sessionId: "sess_deleted", limit: 100 })).resolves.toEqual({
      status: "deleted",
      items: [],
    })
  })

  test("throws on non-404 message loading failures", async () => {
    const loadPage = createSessionMessagesPageLoader(
      createMessagesClient(
        createMessagesResult({
          status: 400,
          error: {
            name: "BadRequestError",
            data: {
              message: "Bad cursor",
            },
          },
        }),
      ),
    )

    await expect(loadPage({ sessionId: "sess_root", limit: 100 })).rejects.toThrow(
      "Failed to load messages for session sess_root (400): Bad cursor",
    )
  })

  test("preserves API page order and leaves ordering to transcript load", async () => {
    const loadPage = createSessionMessagesPageLoader(
      createMessagesClient(
        createMessagesResult({
          status: 200,
          data: [
            { info: createUserMessage("msg_02", "sess_root", 20), parts: [] },
            { info: createUserMessage("msg_01", "sess_root", 10), parts: [] },
          ],
        }),
      ),
    )

    await expect(loadPage({ sessionId: "sess_root", limit: 100 })).resolves.toEqual({
      status: "available",
      items: [
        createMessageRecord("msg_02", "sess_root", 20),
        createMessageRecord("msg_01", "sess_root", 10),
      ],
    })
  })
})

describe("createSessionTranscript", () => {
  test("builds message lookup indexes from ordered messages", () => {
    const transcript = createSessionTranscript({
      sessionId: "sess_root",
      status: "available",
      messages: [createMessageRecord("msg_01", "sess_root", 1), createMessageRecord("msg_02", "sess_root", 2)],
    })

    expect(transcript.messageById.get("msg_01")).toEqual(createMessageRecord("msg_01", "sess_root", 1))
    expect(transcript.messageIndexById.get("msg_01")).toBe(0)
    expect(transcript.messages[1]).toEqual(createMessageRecord("msg_02", "sess_root", 2))
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

    const loaded = await loadSnapshotSessionTranscripts(snapshot, async (sessionId) =>
      createSessionTranscript({
        sessionId,
        status: "available",
        messages: [createMessageRecord(`msg_${sessionId}`, sessionId, 1)],
      }),
    )

    expect(loaded).toEqual({
      sess_child: createSessionTranscript({
        sessionId: "sess_child",
        status: "available",
        messages: [createMessageRecord("msg_sess_child", "sess_child", 1)],
      }),
      sess_root: createSessionTranscript({
        sessionId: "sess_root",
        status: "available",
        messages: [createMessageRecord("msg_sess_root", "sess_root", 1)],
      }),
    })
  })
})
