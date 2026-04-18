/** @jsxImportSource @opentui/solid */

import { createMemo, createResource, For, Match, Switch } from "solid-js"
import { bootstrapTree, type TreeBootstrapResult } from "./bootstrap"

export type TreeRouteProps = {
  readonly projectRoot?: string
  readonly sessionID?: string
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
          </box>
        </Match>
      </Switch>
    </box>
  )
}
