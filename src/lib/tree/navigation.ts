import type { FlatTreeRows, TreeFlatRow } from "./flatten"

export function getInitialSelectedRowIndex(
  flatTree: FlatTreeRows,
  currentSessionId: string,
): number | undefined {
  if (flatTree.rows.length === 0) return undefined
  return flatTree.lastRowIndexBySessionId[currentSessionId] ?? 0
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
