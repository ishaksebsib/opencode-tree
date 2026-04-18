import { describe, expect, test } from "bun:test"
import type { TreeFlatRow } from "../../src/lib/tree/flatten"
import {
  findFirstRowIndexForSession,
  getInitialSelectedRowIndex,
  moveSelectionDown,
  moveSelectionUp,
} from "../../src/lib/tree/navigation"

const rows: readonly TreeFlatRow[] = [
  {
    kind: "session",
    id: "session:sess_root",
    depth: 0,
    sessionId: "sess_root",
    currentSessionId: "sess_child",
    title: "sess_root",
    isCurrentSession: false,
  },
  {
    kind: "message",
    id: "message:sess_root:msg_root",
    depth: 1,
    sessionId: "sess_root",
    currentSessionId: "sess_child",
    messageId: "msg_root",
    role: "user",
    label: "user",
    preview: "root prompt",
  },
  {
    kind: "session",
    id: "session:sess_child",
    depth: 2,
    sessionId: "sess_child",
    currentSessionId: "sess_child",
    title: "sess_child",
    isCurrentSession: true,
  },
  {
    kind: "message",
    id: "message:sess_child:msg_child",
    depth: 3,
    sessionId: "sess_child",
    currentSessionId: "sess_child",
    messageId: "msg_child",
    role: "assistant",
    label: "assistant",
    preview: "child reply",
  },
]

describe("findFirstRowIndexForSession", () => {
  test("finds first row for current session subtree", () => {
    expect(findFirstRowIndexForSession(rows, "sess_child")).toBe(2)
  })

  test("returns undefined when session is absent", () => {
    expect(findFirstRowIndexForSession(rows, "sess_missing")).toBeUndefined()
  })
})

describe("getInitialSelectedRowIndex", () => {
  test("focuses first row for current session", () => {
    expect(getInitialSelectedRowIndex(rows, "sess_child")).toBe(2)
  })

  test("falls back to first row when current session is absent", () => {
    expect(getInitialSelectedRowIndex(rows, "sess_missing")).toBe(0)
  })

  test("returns undefined for empty rows", () => {
    expect(getInitialSelectedRowIndex([], "sess_child")).toBeUndefined()
  })
})

describe("selection movement", () => {
  test("moves down one row and clamps at end", () => {
    expect(moveSelectionDown(rows, 1)).toBe(2)
    expect(moveSelectionDown(rows, 3)).toBe(3)
  })

  test("moves up one row and clamps at start", () => {
    expect(moveSelectionUp(rows, 2)).toBe(1)
    expect(moveSelectionUp(rows, 0)).toBe(0)
  })

  test("starts from first or last row when no selection exists", () => {
    expect(moveSelectionDown(rows, undefined)).toBe(0)
    expect(moveSelectionUp(rows, undefined)).toBe(3)
  })
})
