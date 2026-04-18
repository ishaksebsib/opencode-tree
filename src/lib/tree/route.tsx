/** @jsxImportSource @opentui/solid */

import { useKeyboard } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, Match, on, Switch } from "solid-js"
import type { LoadSnapshotSessionTranscripts } from "../opencode/messages"
import type { TreeFlatRow } from "./flatten"
import { buildFlatRows } from "./flatten"
import { bootstrapTree } from "./bootstrap"
import {
  getInitialSelectedRowIndex,
  moveSelectionDown,
  moveSelectionUp,
} from "./navigation"
import { projectSessionTree } from "./project"
import { TreeView } from "./view"

export type TreeRouteProps = {
  readonly projectRoot?: string
  readonly sessionID?: string
  readonly loadSessionTranscripts: LoadSnapshotSessionTranscripts
}

export function TreeRoute(props: TreeRouteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal<number | undefined>()

  const bootstrapInput = createMemo(() => {
    if (!props.projectRoot) return undefined
    return {
      projectRoot: props.projectRoot,
      sessionID: props.sessionID,
    }
  })

  const [bootstrap] = createResource(bootstrapInput, (input) => bootstrapTree(input))

  const bootstrapErrorMessage = createMemo(() => {
    const error = bootstrap.error
    if (!error) return undefined
    return error instanceof Error ? error.message : String(error)
  })

  const projectedInput = createMemo(() => {
    const result = bootstrap()
    if (!result || result.kind === "missing-session-context") return undefined
    return result
  })

  const [projectedRows] = createResource(projectedInput, async (result) => {
    const transcripts = await props.loadSessionTranscripts(result.snapshot)
    const projectedTree = projectSessionTree(result.snapshot, transcripts)
    return buildFlatRows(projectedTree, result.currentSessionId)
  })

  const projectedErrorMessage = createMemo(() => {
    const error = projectedRows.error
    if (!error) return undefined
    return error instanceof Error ? error.message : String(error)
  })

  const rows = createMemo<readonly TreeFlatRow[]>(() => projectedRows() ?? [])

  createEffect(
    on(rows, (nextRows) => {
      const currentSessionId = props.sessionID
      if (!currentSessionId) {
        setSelectedIndex(undefined)
        return
      }

      setSelectedIndex(getInitialSelectedRowIndex(nextRows, currentSessionId))
    }),
  )

  useKeyboard((evt) => {
    if (rows().length === 0) return

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((currentIndex) => moveSelectionUp(rows(), currentIndex))
      return
    }

    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((currentIndex) => moveSelectionDown(rows(), currentIndex))
    }
  })

  return (
    <box flexDirection="column" padding={1} gap={1}>

      <Switch>
        <Match when={!props.projectRoot}>
          <text>Project root unavailable.</text>
        </Match>

        <Match when={bootstrap.loading}>
          <text>Loading tree ownership...</text>
        </Match>

        <Match when={bootstrapErrorMessage()}>
          <text>Bootstrap error: {bootstrapErrorMessage()}</text>
        </Match>

        <Match when={bootstrap()?.kind === "missing-session-context"}>
          <text>Open /tree from session route.</text>
        </Match>

        <Match when={projectedInput() && projectedRows.loading}>
          <text>Loading session messages...</text>
        </Match>

        <Match when={projectedErrorMessage()}>
          <text>Projection error: {projectedErrorMessage()}</text>
        </Match>

        <Match when={rows().length === 0}>
          <text>Tree empty.</text>
        </Match>

        <Match when={rows().length > 0}>
          <box flexDirection="column" gap={1}>
            <text>Move: ↑/↓ or j/k</text>
            <TreeView rows={rows()} selectedIndex={selectedIndex()} />
          </box>
        </Match>
      </Switch>
    </box>
  )
}
