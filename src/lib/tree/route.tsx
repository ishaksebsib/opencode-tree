/** @jsxImportSource @opentui/solid */

import { createMemo, createResource, For, Match, Switch } from "solid-js"
import type { LoadSnapshotSessionTranscripts } from "../opencode/messages"
import { buildFlatRows, formatTreeFlatRow } from "./flatten"
import { bootstrapTree, type TreeBootstrapResult } from "./bootstrap"
import { projectSessionTree } from "./project"

export type TreeRouteProps = {
  readonly projectRoot?: string
  readonly sessionID?: string
  readonly loadSessionTranscripts: LoadSnapshotSessionTranscripts
}

function getBootstrapLines(result: TreeBootstrapResult): readonly string[] {
  if (result.kind === "missing-session-context") {
    return [
      "Status: missing session context",
      `Project root: ${result.projectRoot}`,
      "Open /tree from session route to bootstrap tree ownership.",
    ]
  }

  const mode = result.kind === "found-tree" ? "loaded existing tree" : "created new tree"

  return [
    `Status: ${mode}`,
    `Project root: ${result.projectRoot}`,
    `Tree ID: ${result.treeId}`,
    `Root session ID: ${result.snapshot.rootSessionId}`,
    `Current session ID: ${result.currentSessionId}`,
  ]
}

export function TreeRoute(props: TreeRouteProps) {
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

  const bootstrapLines = createMemo(() => {
    const result = bootstrap()
    return result ? getBootstrapLines(result) : []
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

  const rowLines = createMemo(() => {
    const rows = projectedRows()
    return rows ? rows.map(formatTreeFlatRow) : []
  })

  return (
    <box flexDirection="column" padding={1} gap={1}>
      <text>
        <b>OpenCode Tree</b>
      </text>
      <text>Route: /tree</text>

      <Switch>
        <Match when={!props.projectRoot}>
          <text>Bootstrap error: project root unavailable.</text>
        </Match>

        <Match when={bootstrap.loading}>
          <text>Bootstrap status: loading tree ownership...</text>
        </Match>

        <Match when={bootstrapErrorMessage()}>
          <text>Bootstrap error: {bootstrapErrorMessage()}</text>
        </Match>

        <Match when={bootstrap()}>
          <box flexDirection="column" gap={1}>
            <For each={bootstrapLines()}>{(line) => <text>{line}</text>}</For>

            <Switch>
              <Match when={projectedInput() && projectedRows.loading}>
                <text>Transcript status: loading messages...</text>
              </Match>

              <Match when={projectedErrorMessage()}>
                <text>Projection error: {projectedErrorMessage()}</text>
              </Match>

              <Match when={rowLines().length > 0}>
                <box flexDirection="column" gap={0}>
                  <text>Projected rows:</text>
                  <For each={rowLines()}>{(line) => <text>{line}</text>}</For>
                </box>
              </Match>
            </Switch>
          </box>
        </Match>
      </Switch>
    </box>
  )
}
