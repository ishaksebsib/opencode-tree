import { describe, expect, test } from "bun:test";
import { createEmptyRegistry, registrySchema, snapshotSchema } from "../../src/lib/storage/schema";

describe("createEmptyRegistry", () => {
  test("returns versioned empty registry", () => {
    expect(createEmptyRegistry()).toEqual({
      version: 1,
      sessions: {},
    });
  });
});

describe("registrySchema", () => {
  test("accepts valid registry", () => {
    const result = registrySchema.safeParse({
      version: 1,
      sessions: {
        sess_root: "tree_01",
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects wrong version", () => {
    const result = registrySchema.safeParse({
      version: 2,
      sessions: {},
    });

    expect(result.success).toBe(false);
  });
});

describe("snapshotSchema", () => {
  test("accepts valid snapshot", () => {
    const result = snapshotSchema.safeParse({
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
    });

    expect(result.success).toBe(true);
  });

  test("rejects child parent mismatch", () => {
    const result = snapshotSchema.safeParse({
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
          parentSessionId: "sess_other",
          anchorMessageId: "msg_01",
          children: [],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test("rejects root anchor", () => {
    const result = snapshotSchema.safeParse({
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: "msg_bad",
          children: [],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
