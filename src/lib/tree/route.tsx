/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, Match, on, Show, Switch } from "solid-js"
import { executeTreeBranchAction } from "../opencode/branch"
import type { LoadSnapshotSessionTranscripts, SessionTranscriptMap } from "../opencode/messages"
import { bootstrapTree } from "./bootstrap"
import { planTreeBranchAction } from "./branch"
import type { FlatTreeRows, TreeFlatRow } from "./flatten"
import { buildFlatRows } from "./flatten"
import { getTreeContentWidth } from "./layout"
import { getInitialSelectedRowIndex, moveSelectionDown, moveSelectionUp } from "./navigation"
import { projectSessionTree } from "./project"
import { mapTreeTheme } from "./theme"
import { TreeView } from "./view"

export type TreeRouteProps = {
  readonly client: OpencodeClient
  readonly projectRoot?: string
  readonly sessionID?: string
  readonly theme: () => TuiThemeCurrent
  readonly loadSessionTranscripts: LoadSnapshotSessionTranscripts
  readonly navigateToSession: (sessionId: string) => void | Promise<void>
}

export function TreeRoute(props: TreeRouteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal<number | undefined>()
  const [branching, setBranching] = createSignal(false)
  const [actionErrorMessage, setActionErrorMessage] = createSignal<string | undefined>()
  const dimensions = useTerminalDimensions()

  const theme = createMemo(() => props.theme())
  const palette = createMemo(() => mapTreeTheme(theme()))

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
    <box flexDirection="column" width="100%" height="100%" padding={1} gap={1} backgroundColor={palette().screenBackground}>
      <box
        flexDirection="row"
        gap={1}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={palette().panelBackground}
        borderColor={palette().panelBorder}
        border={rows().length > 0 ? ["bottom"] : undefined}
      >
        <text fg={branching() ? palette().branchingText : palette().helpText}>
          <span style={{ fg: palette().helpKey }}>↑/↓</span> move • <span style={{ fg: palette().helpKey }}>j/k</span> move •{" "}
          <span style={{ fg: palette().helpKey }}>Enter</span> branch • <span style={{ fg: palette().helpKey }}>esc</span> back
          <Show when={branching()}>
            <span style={{ fg: palette().branchingText }}> • branching…</span>
          </Show>
        </text>
      </box>

      <Show when={actionErrorMessage()}>
        <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
          <text fg={palette().errorText}>Branch error: {actionErrorMessage()}</text>
        </box>
      </Show>

      <Switch>
        <Match when={!props.projectRoot}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().noticeText}>Project root unavailable.</text>
          </box>
        </Match>

        <Match when={bootstrap.loading}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().loadingText}>Loading tree ownership...</text>
          </box>
        </Match>

        <Match when={bootstrapErrorMessage()}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().errorText}>Bootstrap error: {bootstrapErrorMessage()}</text>
          </box>
        </Match>

        <Match when={bootstrap()?.kind === "missing-session-context"}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().noticeText}>Open /tree from session route.</text>
          </box>
        </Match>

        <Match when={projectedInput() && projectedTreeData.loading}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().loadingText}>Loading session messages...</text>
          </box>
        </Match>

        <Match when={projectedErrorMessage()}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().errorText}>Projection error: {projectedErrorMessage()}</text>
          </box>
        </Match>

        <Match when={rows().length === 0}>
          <box backgroundColor={palette().panelBackground} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
            <text fg={palette().emptyText}>Tree empty.</text>
          </box>
        </Match>

        <Match when={rows().length > 0}>
          <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={palette().panelBackground}>
            <TreeView rows={rows()} selectedIndex={selectedIndex()} width={treeWidth()} theme={theme} />
          </box>
        </Match>
      </Switch>
    </box>
  )
}
