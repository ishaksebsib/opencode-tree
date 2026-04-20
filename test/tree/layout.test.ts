import { describe, expect, test } from "bun:test"
import type { MessageFlatRow, SessionFlatRow } from "../../src/lib/tree/flatten"
import { formatTreeRow, getTreeContentWidth } from "../../src/lib/tree/layout"

function createMessageRow(depth: number, preview: string): MessageFlatRow {
  return {
    kind: "message",
    id: `message:sess_root:msg_${depth}`,
    depth,
    sessionId: "sess_root",
    currentSessionId: "sess_other",
    messageId: `msg_${depth}`,
    role: "user",
    label: "user",
    preview,
  }
}

function createSessionRow(isDeleted = false): SessionFlatRow {
  return {
    kind: "session",
    id: "session:sess_root_child_very_long",
    depth: 0,
    sessionId: "sess_root_child_very_long",
    currentSessionId: "sess_root_child_very_long",
    title: "sess_root_child_very_long",
    isCurrentSession: true,
    isDeleted,
  }
}

describe("tree layout", () => {
  test("subtracts route padding from terminal width", () => {
    expect(getTreeContentWidth(120)).toBe(118)
    expect(getTreeContentWidth(1)).toBe(1)
  })

  test("shrinks message preview as depth grows", () => {
    const shallow = formatTreeRow({
      row: createMessageRow(1, "abcdefghijklmnop"),
      selected: false,
      current: false,
      width: 24,
    })

    const deep = formatTreeRow({
      row: createMessageRow(3, "abcdefghijklmnop"),
      selected: false,
      current: false,
      width: 24,
    })

    expect(shallow).toBe("     user: abcdefghijkl…")
    expect(deep).toBe("         user: abcdefgh…")
    expect(shallow.length).toBe(24)
    expect(deep.length).toBe(24)
  })

  test("keeps current session marker and truncates title to available width", () => {
    const row = formatTreeRow({
      row: createSessionRow(),
      selected: true,
      current: true,
      width: 28,
    })

    expect(row).toBe("›• session sess_r… [current]")
    expect(row.length).toBe(28)
  })

  test("renders deleted session suffix", () => {
    const row = formatTreeRow({
      row: createSessionRow(true),
      selected: false,
      current: false,
      width: 48,
    })

    expect(row).toBe("   session sess_root_child_very_long [Deleted]")
  })
})
