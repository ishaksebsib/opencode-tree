/** @jsxImportSource @opentui/solid */

export type TreeRouteProps = {
  sessionID?: string
}

export function TreeRoute(props: TreeRouteProps) {
  return (
    <box flexDirection="column" padding={1} gap={1}>
      <text>
        <b>OpenCode Tree</b>
      </text>
      <text>Route: /tree</text>
      <text>Session context: {props.sessionID ?? "none"}</text>
      <text>Placeholder: tree bootstrap and branch browser land in later phases.</text>
    </box>
  )
}
