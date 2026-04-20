import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { StorageJsonParseError, StorageSchemaError } from "../../src/lib/storage/file"
import { getSnapshotFilePath } from "../../src/lib/storage/paths"
import { type TreeSnapshot } from "../../src/lib/storage/schema"
import { appendChildSession, readSnapshot, writeSnapshot } from "../../src/lib/storage/snapshot"

let projectRoot = ""

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

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "opencode-tree-snapshot-"))
})

afterEach(async () => {
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

describe("readSnapshot", () => {
  test("fails for missing snapshot file", async () => {
    expect(readSnapshot(projectRoot, "tree_01")).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  test("fails clearly for invalid json", async () => {
    const filePath = getSnapshotFilePath(projectRoot, "tree_01")
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, "not json", "utf8")

    expect(readSnapshot(projectRoot, "tree_01")).rejects.toBeInstanceOf(StorageJsonParseError)
  })

  test("fails clearly for invalid schema", async () => {
    const filePath = getSnapshotFilePath(projectRoot, "tree_01")
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(
      filePath,
      JSON.stringify({
        ...snapshot,
        sessions: {
          ...snapshot.sessions,
          sess_child: {
            ...snapshot.sessions.sess_child,
            parentSessionId: "sess_other",
          },
        },
      }),
      "utf8",
    )

    expect(readSnapshot(projectRoot, "tree_01")).rejects.toBeInstanceOf(StorageSchemaError)
  })
})

describe("appendChildSession", () => {
  test("adds child session under parent anchor", () => {
    expect(
      appendChildSession(
        {
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
        },
        {
          sessionId: "sess_child",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_01",
        },
      ),
    ).toEqual(snapshot)
  })

  test("returns original snapshot for duplicate same attachment", () => {
    expect(
      appendChildSession(snapshot, {
        sessionId: "sess_child",
        parentSessionId: "sess_root",
        anchorMessageId: "msg_01",
      }),
    ).toBe(snapshot)
  })

  test("throws for conflicting duplicate attachment", () => {
    expect(() =>
      appendChildSession(snapshot, {
        sessionId: "sess_child",
        parentSessionId: "sess_root",
        anchorMessageId: "msg_other",
      }),
    ).toThrow("Session sess_child is already attached to parent sess_root at anchor msg_01")
  })
})

describe("writeSnapshot", () => {
  test("creates parent dirs and round-trips valid data", async () => {
    const written = await writeSnapshot(projectRoot, snapshot)
    expect(written).toEqual(snapshot)

    expect(readSnapshot(projectRoot, "tree_01")).resolves.toEqual(snapshot)

    const content = await readFile(getSnapshotFilePath(projectRoot, "tree_01"), "utf8")
    expect(content.endsWith("\n")).toBe(true)
  })

  test("rejects invalid snapshot before write", async () => {
    const invalidSnapshot = JSON.parse(
      JSON.stringify({
        ...snapshot,
        sessions: {
          ...snapshot.sessions,
          sess_child: {
            ...snapshot.sessions.sess_child,
            parentSessionId: "sess_other",
          },
        },
      }),
    )

    expect(writeSnapshot(projectRoot, invalidSnapshot)).rejects.toBeInstanceOf(StorageSchemaError)
  })
})
