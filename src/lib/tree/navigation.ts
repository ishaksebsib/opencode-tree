import type { TreeFlatRow } from "./flatten"

export function findFirstRowIndexForSession(
  rows: readonly TreeFlatRow[],
  sessionId: string,
): number | undefined {
  const index = rows.findIndex((row) => row.sessionId === sessionId)
  return index >= 0 ? index : undefined
}

export function getInitialSelectedRowIndex(
  rows: readonly TreeFlatRow[],
  currentSessionId: string,
): number | undefined {
  if (rows.length === 0) return undefined
  return findFirstRowIndexForSession(rows, currentSessionId) ?? 0
}

export function moveSelectionUp(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
): number | undefined {
  return moveSelection(rows, currentIndex, -1)
}

export function moveSelectionDown(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
): number | undefined {
  return moveSelection(rows, currentIndex, 1)
}

export function moveSelection(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
  delta: number,
): number | undefined {
  if (rows.length === 0) return undefined

  if (currentIndex === undefined) {
    return delta < 0 ? rows.length - 1 : 0
  }

  return clampIndex(currentIndex + delta, rows.length)
}

function clampIndex(index: number, length: number): number {
  if (length <= 1) return 0
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}
