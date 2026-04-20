/** @jsxImportSource @opentui/solid */

import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createEffect, createMemo, For, on, onCleanup, onMount } from "solid-js"
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
  let pendingScrollTimeout: ReturnType<typeof setTimeout> | undefined

  const selectedRowId = createMemo(() => {
    const index = props.selectedIndex
    if (index === undefined) return undefined
    return props.rows[index]?.id
  })

  const clearPendingScroll = () => {
    if (pendingScrollTimeout === undefined) return
    clearTimeout(pendingScrollTimeout)
    pendingScrollTimeout = undefined
  }

  const scheduleScrollIntoView = (rowId: string) => {
    clearPendingScroll()

    const scrollIntoViewWhenReady = () => {
      pendingScrollTimeout = undefined
      if (!scroll) return

      const child = scroll.content.findDescendantById(rowId)
      if (!child || scroll.viewport.height <= 0 || child.height <= 0) {
        pendingScrollTimeout = setTimeout(scrollIntoViewWhenReady, 0)
        return
      }

      scroll.scrollChildIntoView(rowId)
    }

    pendingScrollTimeout = setTimeout(scrollIntoViewWhenReady, 0)
  }

	// scroll to last session message when mounting
  onMount(() => {
    const rowId = selectedRowId()
    if (!rowId) return
    scheduleScrollIntoView(rowId)
  })

  createEffect(
    on(selectedRowId, (rowId) => {
      if (!rowId) return
      scheduleScrollIntoView(rowId)
    }, { defer: true }),
  )

  onCleanup(() => {
    clearPendingScroll()
  })

  return (
    <scrollbox ref={(renderable: ScrollBoxRenderable) => (scroll = renderable)} flexGrow={1} minHeight={0} width="100%" scrollbarOptions={{ visible: false }}>
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
