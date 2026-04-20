/** @jsxImportSource @opentui/solid */

import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createEffect, createMemo, For } from "solid-js"
import type { TreeFlatRow } from "./flatten"
import { formatTreeRowParts } from "./layout"
import { getTreeRowBackground, getTreeRowBorder, getTreeRowForeground, mapTreeTheme } from "./theme"

export type TreeViewProps = {
  readonly rows: readonly TreeFlatRow[]
  readonly selectedIndex?: number
  readonly width: number
  readonly theme: () => TuiThemeCurrent
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
            const current = () => row.sessionId === row.currentSessionId
            const attributes = () => (selected() || current() ? TextAttributes.BOLD : undefined)
            const foreground = () => getTreeRowForeground(props.theme(), row, { selected: selected(), current: current() })
            const background = () => getTreeRowBackground(props.theme(), { selected: selected(), current: current() })
            const borderColor = () => getTreeRowBorder(props.theme(), { selected: selected(), current: current() })
            const guideColor = () => mapTreeTheme(props.theme()).guideText
            const parts = () =>
              formatTreeRowParts({
                row,
                selected: selected(),
                current: current(),
                width: props.width,
              })

            return (
              <box
                id={row.id}
                width="100%"
                flexDirection="row"
                backgroundColor={background()}
                border={selected() ? ["left"] : undefined}
                borderColor={borderColor()}
              >
                <text wrapMode="none" attributes={attributes()} fg={guideColor()}>
                  {parts().prefix}
                </text>
                <text wrapMode="none" attributes={attributes()} fg={foreground()}>
                  {parts().body}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </scrollbox>
  )
}
