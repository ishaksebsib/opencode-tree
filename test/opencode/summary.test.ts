import { describe, expect, mock, test } from "bun:test"
import type { OpencodeClient, Part } from "@opencode-ai/sdk/v2"
import { generateTreeBranchSummary } from "../../src/lib/opencode/summary"
import {
  buildTreeBranchSummaryPrompt,
  TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
} from "../../src/lib/tree/summary-prompt"

function createResult<T>(input: { data?: T; error?: unknown; status?: number }) {
  return {
    data: input.data,
    error: input.error,
    request: new Request("http://localhost/test"),
    response: new Response(null, { status: input.status ?? 200 }),
  }
}

type SummaryTestClient = {
  readonly client: OpencodeClient
  readonly createSession: ReturnType<typeof mock>
  readonly promptSession: ReturnType<typeof mock>
  readonly deleteSession: ReturnType<typeof mock>
}

function createClient() {
  const createSession = mock(async () => createResult({ data: { id: "sess_summary" } }))
  const promptSession = mock(async () =>
    createResult({
      data: {
        info: {
          id: "msg_summary",
        },
        parts: [
          {
            id: "part_summary",
            sessionID: "sess_summary",
            messageID: "msg_summary",
            type: "text",
            text: "## Goal\nShip it",
          } satisfies Extract<Part, { type: "text" }>,
        ],
      },
    }),
  )
  const deleteSession = mock(async () => createResult({ data: true }))

  return {
    client: {
      session: {
        create: createSession,
        prompt: promptSession,
        delete: deleteSession,
      },
    } as unknown as OpencodeClient,
    createSession,
    promptSession,
    deleteSession,
  } satisfies SummaryTestClient
}

describe("generateTreeBranchSummary", () => {
  test("creates helper session, prompts for summary, and deletes helper session", async () => {
    const client = createClient()

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
          customInstructions: "focus on blockers",
        },
        { client: client.client },
      ),
    ).resolves.toBe("## Goal\nShip it")

    expect(client.createSession).toHaveBeenCalledWith({
      directory: "/repo",
      title: "Tree branch summary",
    })
    expect(client.promptSession).toHaveBeenCalledWith({
      sessionID: "sess_summary",
      directory: "/repo",
      system: TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
      agent: undefined,
      model: undefined,
      parts: [
        {
          type: "text",
          text: buildTreeBranchSummaryPrompt({
            conversation: "[User]: fix this",
            customInstructions: "focus on blockers",
          }),
        },
      ],
    })
    expect(client.deleteSession).toHaveBeenCalledWith({
      sessionID: "sess_summary",
      directory: "/repo",
    })
  })

  test("passes abort signal to helper-session requests and still deletes on cancellation", async () => {
    const client = createClient()
    const controller = new AbortController()
    const abortError = new Error("The operation was aborted")
    abortError.name = "AbortError"

    client.promptSession.mockImplementation(async () => {
      throw abortError
    })

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
          signal: controller.signal,
        },
        { client: client.client },
      ),
    ).rejects.toThrow("Summary generation cancelled.")

    expect(client.createSession).toHaveBeenCalledWith(
      {
        directory: "/repo",
        title: "Tree branch summary",
      },
      { signal: controller.signal },
    )
    expect((client.promptSession as any).mock.calls[0]?.[1]).toEqual({ signal: controller.signal })
    expect(client.deleteSession).toHaveBeenCalledWith({
      sessionID: "sess_summary",
      directory: "/repo",
    })
  })

  test("deletes helper session even when prompt generation fails", async () => {
    const client = createClient()
    client.promptSession.mockImplementation(async () =>
      createResult({
        error: {
          data: {
            message: "Provider unavailable",
          },
        },
        status: 400,
      }),
    )

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
        },
        { client: client.client },
      ),
    ).rejects.toThrow("Failed to generate branch summary (400): Provider unavailable")

    expect(client.deleteSession).toHaveBeenCalledWith({
      sessionID: "sess_summary",
      directory: "/repo",
    })
  })

  test("treats helper session cleanup failure as a generation failure", async () => {
    const client = createClient()
    client.deleteSession.mockImplementation(async () =>
      createResult({
        error: {
          data: {
            message: "Session busy",
          },
        },
        status: 400,
      }),
    )

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
        },
        { client: client.client },
      ),
    ).rejects.toThrow("Failed to delete summary helper session (400): Session busy")
  })

  test("combines generation and cleanup failures when both happen", async () => {
    const client = createClient()
    client.promptSession.mockImplementation(async () =>
      createResult({
        error: {
          data: {
            message: "Provider unavailable",
          },
        },
        status: 400,
      }),
    )
    client.deleteSession.mockImplementation(async () =>
      createResult({
        error: {
          data: {
            message: "Session busy",
          },
        },
        status: 400,
      }),
    )

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
        },
        { client: client.client },
      ),
    ).rejects.toThrow(
      "Failed to generate branch summary (400): Provider unavailable; cleanup failed: Failed to delete summary helper session (400): Session busy",
    )
  })
})
