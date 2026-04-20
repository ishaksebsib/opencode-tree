import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { TreeFlatRow } from "./flatten"

export type TreeThemePalette = {
  readonly screenBackground: TuiThemeCurrent["background"]
  readonly panelBackground: TuiThemeCurrent["backgroundPanel"]
  readonly panelBorder: TuiThemeCurrent["borderSubtle"]
  readonly selectedRowBackground: TuiThemeCurrent["backgroundElement"]
  readonly selectedRowBorder: TuiThemeCurrent["borderActive"]
  readonly guideText: TuiThemeCurrent["primary"]
  readonly helpText: TuiThemeCurrent["textMuted"]
  readonly helpKey: TuiThemeCurrent["accent"]
  readonly loadingText: TuiThemeCurrent["info"]
  readonly emptyText: TuiThemeCurrent["textMuted"]
  readonly errorText: TuiThemeCurrent["error"]
  readonly noticeText: TuiThemeCurrent["warning"]
  readonly branchingText: TuiThemeCurrent["accent"]
}

export type TreeRowStyleState = {
  readonly selected: boolean
  readonly current: boolean
}

export function mapTreeTheme(theme: TuiThemeCurrent): TreeThemePalette {
  return {
    screenBackground: theme.background,
    panelBackground: theme.background,
    panelBorder: theme.borderSubtle,
    selectedRowBackground: theme.backgroundElement,
    selectedRowBorder: theme.borderActive,
    guideText: theme.primary,
    helpText: theme.textMuted,
    helpKey: theme.text,
    loadingText: theme.info,
    emptyText: theme.textMuted,
    errorText: theme.error,
    noticeText: theme.warning,
    branchingText: theme.accent,
  }
}

export function getTreeRowForeground(
  theme: TuiThemeCurrent,
  row: TreeFlatRow,
  _state: TreeRowStyleState,
): TuiThemeCurrent["text"] {
  if (row.kind === "session") {
    if (row.isDeleted) return theme.error
    return theme.secondary
  }

  if (row.role === "assistant") {
    return theme.textMuted
  }

  if (row.role === "user") {
    return theme.primary
  }

  return theme.text
}

export function getTreeRowBackground(
  theme: TuiThemeCurrent,
  state: TreeRowStyleState,
): TuiThemeCurrent["backgroundElement"] | undefined {
  if (!state.selected) return undefined
  return theme.backgroundElement
}

export function getTreeRowBorder(
  theme: TuiThemeCurrent,
  state: TreeRowStyleState,
): TuiThemeCurrent["borderActive"] | undefined {
  if (!state.selected) return undefined
  return theme.borderActive
}
