import type { FlatTreeRows, TreeFlatRow } from "./flatten";
import type { TreeRowId } from "./visible";

export function getInitialSelectedRowId(
  flatTree: FlatTreeRows,
  currentSessionId: string,
): TreeRowId | undefined {
  if (flatTree.rows.length === 0) return undefined;
  const rowIndex = flatTree.lastRowIndexBySessionId[currentSessionId] ?? 0;
  return flatTree.rows[rowIndex]?.id;
}

export function resolveVisibleSelectionRowId(input: {
  readonly flatTree: FlatTreeRows;
  readonly currentSessionId?: string;
  readonly parentRowIdById: ReadonlyMap<TreeRowId, TreeRowId | undefined>;
  readonly preferredRowId?: TreeRowId;
}): TreeRowId | undefined {
  const preferredRowId = input.preferredRowId;
  if (preferredRowId) {
    let nextRowId: TreeRowId | undefined = preferredRowId;

    while (nextRowId) {
      if (input.flatTree.rowIndexById[nextRowId] !== undefined) {
        return nextRowId;
      }

      nextRowId = input.parentRowIdById.get(nextRowId);
    }
  }

  if (input.currentSessionId) {
    return getInitialSelectedRowId(input.flatTree, input.currentSessionId);
  }

  return input.flatTree.rows[0]?.id;
}

export function moveSelectionUp(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
): number | undefined {
  return moveSelectionBy(rows, currentIndex, -1);
}

export function moveSelectionDown(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
): number | undefined {
  return moveSelectionBy(rows, currentIndex, 1);
}

export function moveSelectionBy(
  rows: readonly TreeFlatRow[],
  currentIndex: number | undefined,
  delta: number,
): number | undefined {
  if (rows.length === 0) return undefined;

  if (currentIndex === undefined) {
    return delta < 0 ? rows.length - 1 : 0;
  }

  return clampIndex(currentIndex + delta, rows.length);
}

function clampIndex(index: number, length: number): number {
  if (length <= 1) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}
