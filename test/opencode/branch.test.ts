import { describe, expect, mock, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { executeTreeBranchAction, executeTreeSummaryFork } from "../../src/lib/opencode/branch"
import { buildTreeBranchSummaryMessage } from "../../src/lib/tree/summary-prompt"
import type { TreeRegistry, TreeSnapshot } from "../../src/lib/storage"

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

type BranchTestClient = {
  readonly client: OpencodeClient
  readonly forkSession: ReturnType<typeof mock>
  readonly promptSession: ReturnType<typeof mock>
  readonly deleteSession: ReturnType<typeof mock>
  readonly appendPrompt: ReturnType<typeof mock>
  readonly showToast: ReturnType<typeof mock>
}

function createClient() {
  const forkSession = mock(async () => ({
    data: {
      id: "sess_child",
    },
  }))
  const promptSession = mock(async () => ({ data: { info: { id: "msg_summary" }, parts: [] } }))
  const deleteSession = mock(async () => ({ data: true }))
  const appendPrompt = mock(async () => ({ data: true }))
  const showToast = mock(async () => ({ data: true }))

  return {
    client: {
      session: {
        fork: forkSession,
        prompt: promptSession,
        delete: deleteSession,
      },
      tui: {
        appendPrompt,
        showToast,
      },
    } as unknown as OpencodeClient,
    forkSession,
    promptSession,
    deleteSession,
    appendPrompt,
    showToast,
  } satisfies BranchTestClient
}

describe("executeTreeBranchAction", () => {
  test("forks, persists tree state, navigates, and appends prompt text", async () => {
    const client = createClient()
    const navigateToSession = mock(() => {})
    const storageRoot = "/state/opencode/plugins/opencode-tree/projects/repo-123"
    const writeSnapshot = mock(async (_storageRoot: string, nextSnapshot: TreeSnapshot) => nextSnapshot)
    const writeRegistry = mock(async (_storageRoot: string, nextRegistry: TreeRegistry) => nextRegistry)

    await executeTreeBranchAction(
        {
          action: {
            kind: "fork",
            plan: {
              sessionId: "sess_root",
              anchorMessageId: "msg_user",
              forkMessageId: "msg_user",
              appendPromptText: "hello branch",
            },
          },
          projectRoot: "/repo",
        storageRoot,
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
        storage: {
          readRegistry: async () => ({
            version: 1,
            sessions: {
              sess_root: "tree_01",
            },
          }),
          writeSnapshot,
          writeRegistry,
        },
      },
    )

    expect(client.forkSession).toHaveBeenCalledWith({
      sessionID: "sess_root",
      messageID: "msg_user",
      directory: "/repo",
    })
    expect(writeSnapshot).toHaveBeenCalledWith(storageRoot, {
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
          anchorMessageId: "msg_user",
          children: [],
        },
      },
    })
    expect(writeRegistry).toHaveBeenCalledWith(storageRoot, {
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    })
    expect(navigateToSession).toHaveBeenCalledWith("sess_child")
    expect(client.appendPrompt).toHaveBeenCalledWith({
      directory: "/repo",
      text: "hello branch",
    })
  })

  test("switches session without forking when action says switch-session", async () => {
    const client = createClient()
    const navigateToSession = mock(() => {})

    await executeTreeBranchAction(
      {
        action: {
          kind: "switch-session",
          sessionId: "sess_root",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
      },
    )

    expect(navigateToSession).toHaveBeenCalledWith("sess_root")
    expect(client.forkSession).not.toHaveBeenCalled()
    expect(client.appendPrompt).not.toHaveBeenCalled()
  })

  test("does nothing for noop action", async () => {
    const client = createClient()
    const navigateToSession = mock(() => {})

    await executeTreeBranchAction(
      {
        action: {
          kind: "noop",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
      },
    )

    expect(navigateToSession).not.toHaveBeenCalled()
    expect(client.forkSession).not.toHaveBeenCalled()
    expect(client.appendPrompt).not.toHaveBeenCalled()
    expect(client.showToast).not.toHaveBeenCalled()
  })

  test("shows toast for notice action", async () => {
    const client = createClient()

    await executeTreeBranchAction(
      {
        action: {
          kind: "show-notice",
          message: "Select a message row first.",
          variant: "info",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession: () => {},
      },
    )

    expect(client.showToast).toHaveBeenCalledWith({
      directory: "/repo",
      message: "Select a message row first.",
      variant: "info",
    })
  })

  test("generates summary, injects it into the forked session, and then replays user text", async () => {
    const client = createClient()
    const navigateToSession = mock(() => {})
    const storageRoot = "/state/opencode/plugins/opencode-tree/projects/repo-123"
    const writeSnapshot = mock(async (_storageRoot: string, nextSnapshot: TreeSnapshot) => nextSnapshot)
    const writeRegistry = mock(async (_storageRoot: string, nextRegistry: TreeRegistry) => nextRegistry)
    const generateSummary = mock(async () => "## Goal\nShip it")

    await executeTreeSummaryFork(
      {
        plan: {
          sessionId: "sess_root",
          anchorMessageId: "msg_user",
          forkMessageId: "msg_user",
          appendPromptText: "hello branch",
        },
        projectRoot: "/repo",
        storageRoot,
        snapshot,
        conversation: "[User]: fix this",
        customInstructions: "focus on blockers",
      },
      {
        client: client.client,
        generateSummary,
        navigateToSession,
        storage: {
          readRegistry: async () => ({
            version: 1,
            sessions: {
              sess_root: "tree_01",
            },
          }),
          writeSnapshot,
          writeRegistry,
        },
      },
    )

    expect(generateSummary).toHaveBeenCalledWith(
      {
        projectRoot: "/repo",
        conversation: "[User]: fix this",
        customInstructions: "focus on blockers",
        signal: undefined,
      },
      { client: client.client },
    )
    expect(client.forkSession).toHaveBeenCalledWith({
      sessionID: "sess_root",
      messageID: "msg_user",
      directory: "/repo",
    })
    expect(client.promptSession).toHaveBeenCalledWith({
      sessionID: "sess_child",
      directory: "/repo",
      noReply: true,
      parts: [
        {
          type: "text",
          text: buildTreeBranchSummaryMessage("## Goal\nShip it"),
        },
      ],
    })
    expect(writeSnapshot).toHaveBeenCalled()
    expect(writeRegistry).toHaveBeenCalled()
    expect(navigateToSession).toHaveBeenCalledWith("sess_child")
    expect(client.appendPrompt).toHaveBeenCalledWith({
      directory: "/repo",
      text: "hello branch",
    })
  })

  test("does not fork when summary generation fails", async () => {
    const client = createClient()

    await expect(
      executeTreeSummaryFork(
        {
          plan: {
            sessionId: "sess_root",
            anchorMessageId: "msg_user",
            forkMessageId: "msg_user",
          },
          projectRoot: "/repo",
          storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
          snapshot,
          conversation: "[User]: fix this",
        },
        {
          client: client.client,
          generateSummary: async () => {
            throw new Error("summary failed")
          },
          navigateToSession: () => {},
        },
      ),
    ).rejects.toThrow("summary failed")

    expect(client.forkSession).not.toHaveBeenCalled()
    expect(client.promptSession).not.toHaveBeenCalled()
  })

  test("deletes the forked session if writing the summary into it fails", async () => {
    const client = createClient()
    client.promptSession.mockImplementation(async () => ({ error: new Error("inject failed") }) as any)

    await expect(
      executeTreeSummaryFork(
        {
          plan: {
            sessionId: "sess_root",
            anchorMessageId: "msg_user",
            forkMessageId: "msg_user",
          },
          projectRoot: "/repo",
          storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
          snapshot,
          conversation: "[User]: fix this",
        },
        {
          client: client.client,
          generateSummary: async () => "## Goal\nShip it",
          navigateToSession: () => {},
        },
      ),
    ).rejects.toThrow("Failed to write summary into the new branch session")

    expect(client.deleteSession).toHaveBeenCalledWith({
      sessionID: "sess_child",
      directory: "/repo",
    })
  })
})
