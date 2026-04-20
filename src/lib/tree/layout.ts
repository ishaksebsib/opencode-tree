import type { TreeFlatRow } from "./flatten"

export const TREE_ROUTE_HORIZONTAL_PADDING = 2

const INDENT_UNIT = "  "
const GUIDE_MARKER = "┃"
const SESSION_PREFIX = "SESSION"
const CURRENT_SESSION_SUFFIX = " [CURRENT]"
const DELETED_SESSION_SUFFIX = " [DELETED]"

export type FormatTreeRowInput = {
  readonly row: TreeFlatRow
  readonly selected: boolean
  readonly current: boolean
  readonly width: number
}

export function getTreeContentWidth(viewportWidth: number): number {
  return Math.max(1, viewportWidth - TREE_ROUTE_HORIZONTAL_PADDING)
}

export type FormattedTreeRow = {
  readonly prefix: string
  readonly body: string
}

export function formatTreeRowParts(input: FormatTreeRowInput): FormattedTreeRow {
  const width = Math.max(1, input.width)
  const prefix = formatRowPrefix(input.row.depth, input.selected, input.current)

  if (input.row.kind === "session") {
    const suffix = formatSessionSuffix(input.row, input.current)
    const label = `${SESSION_PREFIX}${suffix}:`
    const titleWidth = Math.max(0, width - prefix.length - label.length - 1)
    const title = truncateToWidth(input.row.title, titleWidth)
    const body = title ? `${label} ${title}` : label
    return {
      prefix,
      body: truncateToWidth(body, Math.max(0, width - prefix.length)),
    }
  }

  const label = `${input.row.role}: `
  const previewWidth = Math.max(0, width - prefix.length - label.length)
  const preview = truncateToWidth(input.row.preview, previewWidth)
  const body = preview ? `${label}${preview}` : label.trimEnd()
  return {
    prefix,
    body: truncateToWidth(body, Math.max(0, width - prefix.length)),
  }
}

export function formatTreeRow(input: FormatTreeRowInput): string {
  const parts = formatTreeRowParts(input)
  return `${parts.prefix}${parts.body}`
}

function formatSessionSuffix(row: Extract<TreeFlatRow, { kind: "session" }>, current: boolean): string {
  const suffixes = [] as string[]

  if (row.isDeleted) {
    suffixes.push(DELETED_SESSION_SUFFIX)
  }

  if (current) {
    suffixes.push(CURRENT_SESSION_SUFFIX)
  }

  return suffixes.join("")
}

function formatRowPrefix(depth: number, selected: boolean, current: boolean): string {
  const indent = INDENT_UNIT.repeat(depth)
  const selectedMarker = selected ? "›" : " "
  const currentMarker = current && !selected ? GUIDE_MARKER : " "
  return `${selectedMarker}${currentMarker} ${indent}`
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return `${text.slice(0, width - 1)}…`
}
