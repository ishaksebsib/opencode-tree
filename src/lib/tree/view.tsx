/** @jsxImportSource @opentui/solid */

import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { createEffect, createMemo, For } from "solid-js"
import type { TreeFlatRow } from "./flatten"
import { formatTreeRow } from "./layout"

export type TreeViewProps = {
  readonly rows: readonly TreeFlatRow[]
  readonly selectedIndex?: number
  readonly width: number
}

export function TreeView(props: TreeViewProps) {
  let scroll: ScrollBoxRenderable | undefined

  const selectedRowId = createMemo(() => {
    const index = props.selectedIndex
    if (index === undefined) return undefined
    return props.rows[index]?.id
  })

  createEffect(() => {
    const rowId = selectedRowId()
    if (!rowId) return

    queueMicrotask(() => {
      scroll?.scrollChildIntoView(rowId)
    })
  })

  return (
    <scrollbox ref={(renderable: ScrollBoxRenderable) => (scroll = renderable)} flexGrow={1} width="100%" scrollbarOptions={{ visible: false }}>
      <box flexDirection="column" gap={0} width="100%">
        <For each={props.rows}>
          {(row, index) => {
            const selected = () => props.selectedIndex === index()
            const current = row.sessionId === row.currentSessionId
            const attributes = () => (selected() || current ? TextAttributes.BOLD : undefined)

            return (
              <box id={row.id} width="100%">
                <text wrapMode="none" attributes={attributes()}>
                  {formatTreeRow({
                    row,
                    selected: selected(),
                    current,
                    width: props.width,
                  })}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </scrollbox>
  )
}
