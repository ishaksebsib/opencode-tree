import { describe, expect, mock, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { executeTreeBranchAction } from "../../src/lib/opencode/branch"
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

function createClient() {
  return {
    session: {
      fork: mock(async () => ({
        data: {
          id: "sess_child",
        },
      })),
    },
    tui: {
      appendPrompt: mock(async () => ({ data: true })),
      showToast: mock(async () => ({ data: true })),
    },
  } as unknown as OpencodeClient
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
        client,
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

    expect(client.session.fork).toHaveBeenCalledWith({
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
    expect(client.tui.appendPrompt).toHaveBeenCalledWith({
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
        client,
        navigateToSession,
      },
    )

    expect(navigateToSession).toHaveBeenCalledWith("sess_root")
    expect(client.session.fork).not.toHaveBeenCalled()
    expect(client.tui.appendPrompt).not.toHaveBeenCalled()
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
        client,
        navigateToSession,
      },
    )

    expect(navigateToSession).not.toHaveBeenCalled()
    expect(client.session.fork).not.toHaveBeenCalled()
    expect(client.tui.appendPrompt).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
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
        client,
        navigateToSession: () => {},
      },
    )

    expect(client.tui.showToast).toHaveBeenCalledWith({
      directory: "/repo",
      message: "Select a message row first.",
      variant: "info",
    })
  })
})
