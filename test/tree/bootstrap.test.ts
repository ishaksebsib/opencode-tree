import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readRegistry, readSnapshot, writeRegistry, writeSnapshot, type TreeSnapshot } from "../../src/lib/storage"
import { bootstrapTree, createRootTreeSnapshot } from "../../src/lib/tree/bootstrap"

let projectRoot = ""

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "opencode-tree-bootstrap-"))
})

afterEach(async () => {
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

describe("bootstrapTree", () => {
  test("loads existing tree for known session", async () => {
    const snapshot: TreeSnapshot = {
      version: 1,
      treeId: "tree_existing",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_known"],
        },
        sess_known: {
          sessionId: "sess_known",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_01",
          children: [],
        },
      },
    }

    await writeSnapshot(projectRoot, snapshot)
    await writeRegistry(projectRoot, {
      version: 1,
      sessions: {
        sess_known: "tree_existing",
      },
    })

    const result = await bootstrapTree({
      projectRoot,
      sessionID: "sess_known",
    })

    expect(result).toEqual({
      kind: "found-tree",
      projectRoot,
      treeId: "tree_existing",
      currentSessionId: "sess_known",
      snapshot,
    })
  })

  test("creates new tree for unknown session", async () => {
    const result = await bootstrapTree(
      {
        projectRoot,
        sessionID: "sess_new",
      },
      {
        storage: {
          readRegistry,
          writeRegistry,
          readSnapshot,
          writeSnapshot,
        },
        createTreeId: () => "tree_created",
      },
    )

    const expectedSnapshot = createRootTreeSnapshot("tree_created", "sess_new")

    expect(result).toEqual({
      kind: "created-tree",
      projectRoot,
      treeId: "tree_created",
      currentSessionId: "sess_new",
      snapshot: expectedSnapshot,
    })

    expect(readRegistry(projectRoot)).resolves.toEqual({
      version: 1,
      sessions: {
        sess_new: "tree_created",
      },
    })

    expect(readSnapshot(projectRoot, "tree_created")).resolves.toEqual(expectedSnapshot)
  })

  test("returns missing session context without touching storage", async () => {
    const result = await bootstrapTree({
      projectRoot,
    })

    expect(result).toEqual({
      kind: "missing-session-context",
      projectRoot,
    })

    expect(readRegistry(projectRoot)).resolves.toEqual({
      version: 1,
      sessions: {},
    })
  })
})
