/** @jsxImportSource @opentui/solid */

import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, Match, on, Show, Switch } from "solid-js"
import { executeTreeBranchAction } from "../opencode/branch"
import type { LoadSnapshotSessionTranscripts, SessionTranscriptMap } from "../opencode/messages"
import { planTreeBranchAction } from "./branch"
import type { FlatTreeRows, TreeFlatRow } from "./flatten"
import { buildFlatRows } from "./flatten"
import { bootstrapTree } from "./bootstrap"
import { getInitialSelectedRowIndex, moveSelectionDown, moveSelectionUp } from "./navigation"
import { projectSessionTree } from "./project"
import { getTreeContentWidth } from "./layout"
import { TreeView } from "./view"

export type TreeRouteProps = {
  readonly client: OpencodeClient
  readonly projectRoot?: string
  readonly sessionID?: string
  readonly loadSessionTranscripts: LoadSnapshotSessionTranscripts
  readonly navigateToSession: (sessionId: string) => void | Promise<void>
}

export function TreeRoute(props: TreeRouteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal<number | undefined>()
  const [branching, setBranching] = createSignal(false)
  const [actionErrorMessage, setActionErrorMessage] = createSignal<string | undefined>()
  const dimensions = useTerminalDimensions()

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

  const [projectedTreeData] = createResource(projectedInput, async (result) => {
    const transcripts = await props.loadSessionTranscripts(result.snapshot)
    const projectedTree = projectSessionTree(result.snapshot, transcripts)
    const flatTree = buildFlatRows(projectedTree, result.currentSessionId)

    return {
      transcripts,
      flatTree,
    } satisfies {
      transcripts: SessionTranscriptMap
      flatTree: FlatTreeRows
    }
  })

  const projectedErrorMessage = createMemo(() => {
    const error = projectedTreeData.error
    if (!error) return undefined
    return error instanceof Error ? error.message : String(error)
  })

  const rows = createMemo<readonly TreeFlatRow[]>(() => projectedTreeData()?.flatTree.rows ?? [])
  const selectedRow = createMemo(() => {
    const index = selectedIndex()
    if (index === undefined) return undefined
    return rows()[index]
  })
  const treeWidth = createMemo(() => getTreeContentWidth(dimensions().width))

  createEffect(
    on(projectedTreeData, (nextTreeData) => {
      const currentSessionId = props.sessionID
      if (!currentSessionId) {
        setSelectedIndex(undefined)
        return
      }

      if (!nextTreeData) {
        setSelectedIndex(undefined)
        return
      }

      setSelectedIndex(getInitialSelectedRowIndex(nextTreeData.flatTree, currentSessionId))
    }),
  )

  useKeyboard((evt) => {
    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      if (!props.sessionID) return
      evt.preventDefault()
      evt.stopPropagation()
      void props.navigateToSession(props.sessionID)
      return
    }

    if (branching() || rows().length === 0) return

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
      return
    }

    if (evt.name === "return") {
      const bootstrapResult = bootstrap()
      const treeData = projectedTreeData()
      if (!bootstrapResult || bootstrapResult.kind === "missing-session-context" || !treeData) return

      evt.preventDefault()
      evt.stopPropagation()
      setActionErrorMessage(undefined)
      const action = planTreeBranchAction({
        row: selectedRow(),
        transcripts: treeData.transcripts,
      })

      setBranching(true)
      void executeTreeBranchAction(
        {
          action,
          projectRoot: bootstrapResult.projectRoot,
          snapshot: bootstrapResult.snapshot,
        },
        {
          client: props.client,
          navigateToSession: props.navigateToSession,
        },
      )
        .catch((error) => {
          setActionErrorMessage(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          setBranching(false)
        })
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1} gap={1}>
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

        <Match when={projectedInput() && projectedTreeData.loading}>
          <text>Loading session messages...</text>
        </Match>

        <Match when={projectedErrorMessage()}>
          <text>Projection error: {projectedErrorMessage()}</text>
        </Match>

        <Match when={rows().length === 0}>
          <text>Tree empty.</text>
        </Match>

        <Match when={rows().length > 0}>
          <box flexDirection="column" gap={1} flexGrow={1} minHeight={0}>
            <text>{branching() ? "Branching..." : "Move: ↑/↓ or j/k • Branch: Enter • Back: esc/Ctrl-C"}</text>
            <Show when={actionErrorMessage()}>
              <text>Branch error: {actionErrorMessage()}</text>
            </Show>
            <TreeView rows={rows()} selectedIndex={selectedIndex()} width={treeWidth()} />
          </box>
        </Match>
      </Switch>
    </box>
  )
}
