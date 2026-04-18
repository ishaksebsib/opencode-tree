/** @jsxImportSource @opentui/solid */

import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import type { TreeFlatRow } from "./flatten"

export type TreeViewProps = {
  readonly rows: readonly TreeFlatRow[]
  readonly selectedIndex?: number
}

export function TreeView(props: TreeViewProps) {
  return (
    <box flexDirection="column" gap={0}>
      <For each={props.rows}>
        {(row, index) => {
          const selected = () => props.selectedIndex === index()
          const current = row.sessionId === row.currentSessionId
          const attributes = () => (selected() || current ? TextAttributes.BOLD : undefined)

          return (
            <text attributes={attributes()}>{formatTreeViewRow(row, selected(), current)}</text>
          )
        }}
      </For>
    </box>
  )
}

export function formatTreeViewRow(row: TreeFlatRow, selected: boolean, current: boolean): string {
  const indent = "  ".repeat(row.depth)
  const selectedMarker = selected ? "›" : " "
  const currentMarker = current ? "•" : " "

  if (row.kind === "session") {
    const currentLabel = current ? " [current]" : ""
    return `${selectedMarker}${currentMarker} ${indent}session ${row.sessionId}${currentLabel}`
  }

  return `${selectedMarker}${currentMarker} ${indent}${row.role}: ${row.preview}`
}
