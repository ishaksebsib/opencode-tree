import type { TreeFlatRow } from "./flatten"

export const TREE_ROUTE_HORIZONTAL_PADDING = 2

const INDENT_UNIT = "  "
const SESSION_PREFIX = "session "
const CURRENT_SESSION_SUFFIX = " [current]"

export type FormatTreeRowInput = {
  readonly row: TreeFlatRow
  readonly selected: boolean
  readonly current: boolean
  readonly width: number
}

export function getTreeContentWidth(viewportWidth: number): number {
  return Math.max(1, viewportWidth - TREE_ROUTE_HORIZONTAL_PADDING)
}

export function formatTreeRow(input: FormatTreeRowInput): string {
  const width = Math.max(1, input.width)
  const prefix = formatRowPrefix(input.row.depth, input.selected, input.current)

  if (input.row.kind === "session") {
    const suffix = input.current ? CURRENT_SESSION_SUFFIX : ""
    const titleWidth = Math.max(0, width - prefix.length - SESSION_PREFIX.length - suffix.length)
    const title = truncateToWidth(input.row.title, titleWidth)
    const body = title ? `${SESSION_PREFIX}${title}${suffix}` : `${SESSION_PREFIX.trimEnd()}${suffix}`
    return truncateToWidth(`${prefix}${body}`, width)
  }

  const label = `${input.row.role}: `
  const previewWidth = Math.max(0, width - prefix.length - label.length)
  const preview = truncateToWidth(input.row.preview, previewWidth)
  const body = preview ? `${label}${preview}` : label.trimEnd()
  return truncateToWidth(`${prefix}${body}`, width)
}

function formatRowPrefix(depth: number, selected: boolean, current: boolean): string {
  const indent = INDENT_UNIT.repeat(depth)
  const selectedMarker = selected ? "›" : " "
  const currentMarker = current ? "•" : " "
  return `${selectedMarker}${currentMarker} ${indent}`
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return `${text.slice(0, width - 1)}…`
}
