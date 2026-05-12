import { describe, expect, test } from "bun:test";
import type { FlatTreeRows, TreeFlatRow } from "../../src/lib/tree/flatten";
import {
  getInitialSelectedRowId,
  moveSelectionBy,
  moveSelectionDown,
  moveSelectionUp,
  resolveVisibleSelectionRowId,
} from "../../src/lib/tree/navigation";
import { getMessageRowId, getSessionRowId } from "../../src/lib/tree/visible";

const rows: readonly TreeFlatRow[] = [
  {
    kind: "session",
    id: getSessionRowId("sess_root"),
    depth: 0,
    sessionId: "sess_root",
    currentSessionId: "sess_child",
    title: "sess_root",
    isDeleted: false,
    isCollapsible: true,
    isCollapsed: false,
  },
  {
    kind: "message",
    id: getMessageRowId("sess_root", "msg_root"),
    depth: 1,
    sessionId: "sess_root",
    currentSessionId: "sess_child",
    messageId: "msg_root",
    role: "user",
    preview: "root prompt",
  },
  {
    kind: "session",
    id: getSessionRowId("sess_child"),
    depth: 2,
    sessionId: "sess_child",
    currentSessionId: "sess_child",
    title: "sess_child",
    isDeleted: false,
    isCollapsible: true,
    isCollapsed: false,
  },
  {
    kind: "message",
    id: getMessageRowId("sess_child", "msg_child"),
    depth: 3,
    sessionId: "sess_child",
    currentSessionId: "sess_child",
    messageId: "msg_child",
    role: "assistant",
    preview: "child reply",
  },
];

const flatTree: FlatTreeRows = {
  rows,
  rowIndexById: {
    "session:sess_root": 0,
    "message:sess_root:msg_root": 1,
    "session:sess_child": 2,
    "message:sess_child:msg_child": 3,
  },
  lastRowIndexBySessionId: {
    sess_root: 1,
    sess_child: 3,
  },
};

describe("getInitialSelectedRowId", () => {
  test("focuses last row for current session in O(1)", () => {
    expect(getInitialSelectedRowId(flatTree, "sess_child")).toBe("message:sess_child:msg_child");
  });

  test("falls back to first row when current session is absent", () => {
    expect(getInitialSelectedRowId(flatTree, "sess_missing")).toBe("session:sess_root");
  });

  test("returns undefined for empty rows", () => {
    expect(
      getInitialSelectedRowId(
        {
          rows: [],
          rowIndexById: {},
          lastRowIndexBySessionId: {},
        },
        "sess_child",
      ),
    ).toBeUndefined();
  });
});

describe("selection movement", () => {
  test("moves down one row and clamps at end", () => {
    expect(moveSelectionDown(rows, 1)).toBe(2);
    expect(moveSelectionDown(rows, 3)).toBe(3);
  });

  test("moves up one row and clamps at start", () => {
    expect(moveSelectionUp(rows, 2)).toBe(1);
    expect(moveSelectionUp(rows, 0)).toBe(0);
  });

  test("starts from first or last row when no selection exists", () => {
    expect(moveSelectionDown(rows, undefined)).toBe(0);
    expect(moveSelectionUp(rows, undefined)).toBe(3);
  });

  test("moves by an arbitrary jump distance and clamps at bounds", () => {
    expect(moveSelectionBy(rows, 0, 20)).toBe(3);
    expect(moveSelectionBy(rows, 3, -20)).toBe(0);
  });

  test("starts from first or last row for arbitrary jumps when no selection exists", () => {
    expect(moveSelectionBy(rows, undefined, 20)).toBe(0);
    expect(moveSelectionBy(rows, undefined, -20)).toBe(3);
  });
});

describe("resolveVisibleSelectionRowId", () => {
  test("keeps the selected row when it is still visible", () => {
    expect(
      resolveVisibleSelectionRowId({
        flatTree,
        currentSessionId: "sess_child",
        parentRowIdById: new Map(),
        preferredRowId: "message:sess_child:msg_child",
      }),
    ).toBe("message:sess_child:msg_child");
  });

  test("falls back to nearest visible ancestor when selected row is hidden", () => {
    expect(
      resolveVisibleSelectionRowId({
        flatTree: {
          rows: rows.slice(0, 3),
          rowIndexById: {
            "session:sess_root": 0,
            "message:sess_root:msg_root": 1,
            "session:sess_child": 2,
          },
          lastRowIndexBySessionId: {
            sess_root: 1,
            sess_child: 2,
          },
        },
        currentSessionId: "sess_child",
        parentRowIdById: new Map([
          ["message:sess_child:msg_child", "session:sess_child"],
          ["session:sess_child", "message:sess_root:msg_root"],
        ]),
        preferredRowId: "message:sess_child:msg_child",
      }),
    ).toBe("session:sess_child");
  });
});
