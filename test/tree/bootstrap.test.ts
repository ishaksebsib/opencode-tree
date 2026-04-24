import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRegistry,
  readSnapshot,
  writeRegistry,
  writeSnapshot,
  type TreeSnapshot,
} from "../../src/lib/storage";
import { bootstrapTree, createRootTreeSnapshot } from "../../src/lib/tree/bootstrap";

let storageRoot = "";

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), "opencode-tree-bootstrap-"));
});

afterEach(async () => {
  if (storageRoot) {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

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
    };

    await writeSnapshot(storageRoot, snapshot);
    await writeRegistry(storageRoot, {
      version: 1,
      sessions: {
        sess_known: "tree_existing",
      },
    });

    const result = await bootstrapTree({
      projectRoot: "/repo",
      storageRoot,
      sessionID: "sess_known",
    });

    expect(result).toEqual({
      kind: "found-tree",
      projectRoot: "/repo",
      storageRoot,
      treeId: "tree_existing",
      currentSessionId: "sess_known",
      snapshot,
    });
  });

  test("creates new tree for unknown session", async () => {
    const result = await bootstrapTree(
      {
        projectRoot: "/repo",
        storageRoot,
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
    );

    const expectedSnapshot = createRootTreeSnapshot("tree_created", "sess_new");

    expect(result).toEqual({
      kind: "created-tree",
      projectRoot: "/repo",
      storageRoot,
      treeId: "tree_created",
      currentSessionId: "sess_new",
      snapshot: expectedSnapshot,
    });

    expect(readRegistry(storageRoot)).resolves.toEqual({
      version: 1,
      sessions: {
        sess_new: "tree_created",
      },
    });

    expect(readSnapshot(storageRoot, "tree_created")).resolves.toEqual(expectedSnapshot);
  });

  test("returns missing session context without touching storage", async () => {
    const result = await bootstrapTree({
      projectRoot: "/repo",
      storageRoot,
    });

    expect(result).toEqual({
      kind: "missing-session-context",
      projectRoot: "/repo",
      storageRoot,
    });

    expect(readRegistry(storageRoot)).resolves.toEqual({
      version: 1,
      sessions: {},
    });
  });
});
