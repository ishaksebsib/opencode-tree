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
  readonly autoFocus?: boolean
  readonly onFocusChange?: (focused: boolean) => void
}

type RenderedTreeRow = {
  readonly id: string
  readonly selected: boolean
  readonly backgroundColor?: TuiThemeCurrent["backgroundElement"]
  readonly borderColor?: TuiThemeCurrent["borderActive"]
  readonly guideColor: TuiThemeCurrent["primary"]
  readonly foregroundColor: TuiThemeCurrent["text"]
  readonly attributes?: typeof TextAttributes.BOLD
  readonly parts: ReturnType<typeof formatTreeRowParts>
}

export function TreeView(props: TreeViewProps) {
  let scroll: ScrollBoxRenderable | undefined
  let pendingScrollTimeout: ReturnType<typeof setTimeout> | undefined
  const handleFocused = () => props.onFocusChange?.(true)
  const handleBlurred = () => props.onFocusChange?.(false)

  const renderedRows = createMemo<readonly RenderedTreeRow[]>(() => {
    const theme = props.theme()
    const guideColor = mapTreeTheme(theme).guideText

    return props.rows.map((row, index) => {
      const selected = props.selectedIndex === index
      const current = row.sessionId === row.currentSessionId

      return {
        id: row.id,
        selected,
        backgroundColor: getTreeRowBackground(theme, { selected, current }),
        borderColor: getTreeRowBorder(theme, { selected, current }),
        guideColor,
        foregroundColor: getTreeRowForeground(theme, row, { selected, current }),
        attributes: selected || current ? TextAttributes.BOLD : undefined,
        parts: formatTreeRowParts({
          row,
          selected,
          current,
          width: props.width,
        }),
      }
    })
  })

  const selectedRowId = createMemo(() => {
    const index = props.selectedIndex
    if (index === undefined) return undefined
    return renderedRows()[index]?.id
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
    scroll?.on("focused", handleFocused)
    scroll?.on("blurred", handleBlurred)

    if (props.autoFocus) {
      scroll?.focus()
    }

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
    props.onFocusChange?.(false)
    scroll?.off("focused", handleFocused)
    scroll?.off("blurred", handleBlurred)
  })

  return (
    <scrollbox
      ref={(renderable: ScrollBoxRenderable) => (scroll = renderable)}
      flexGrow={1}
      minHeight={0}
      width="100%"
      focusable
      scrollbarOptions={{ visible: false }}
    >
      <box flexDirection="column" gap={0} width="100%">
        <For each={renderedRows()}>
          {(row) => (
            <box
              id={row.id}
              width="100%"
              flexDirection="row"
              backgroundColor={row.backgroundColor}
              border={row.selected ? ["left"] : undefined}
              borderColor={row.borderColor}
            >
              <text wrapMode="none" attributes={row.attributes} fg={row.guideColor}>
                {row.parts.prefix}
              </text>
              <text wrapMode="none" attributes={row.attributes} fg={row.foregroundColor}>
                {row.parts.body}
              </text>
            </box>
          )}
        </For>
      </box>
    </scrollbox>
  )
}
