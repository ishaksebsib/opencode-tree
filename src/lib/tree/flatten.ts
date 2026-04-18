import type { Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk/v2"
import type { ProjectedMessageNode, ProjectedSessionNode } from "./project"

export type SessionFlatRow = {
  readonly kind: "session"
  readonly id: `session:${string}`
  readonly depth: number
  readonly sessionId: string
  readonly isCurrent: boolean
}

export type MessageFlatRow = {
  readonly kind: "message"
  readonly id: `message:${string}:${string}`
  readonly depth: number
  readonly sessionId: string
  readonly messageId: string
  readonly role: ProjectedMessageNode["record"]["info"]["role"]
  readonly preview: string
}

export type TreeFlatRow = SessionFlatRow | MessageFlatRow

//TODO: config: make this configurable later
const PREVIEW_LIMIT = 90

export function buildFlatRows(
  root: ProjectedSessionNode,
  currentSessionId: string,
): readonly TreeFlatRow[] {
  const rows: TreeFlatRow[] = []
  flattenSession(rows, root, currentSessionId, 0)
  return rows
}

export function formatTreeFlatRow(row: TreeFlatRow): string {
  const indent = "  ".repeat(row.depth)

  if (row.kind === "session") {
    const current = row.isCurrent ? " [current]" : ""
    return `${indent}session ${row.sessionId}${current}`
  }

  return `${indent}${row.role} ${row.messageId} ${row.preview}`
}

function flattenSession(
  rows: TreeFlatRow[],
  session: ProjectedSessionNode,
  currentSessionId: string,
  depth: number,
): void {
  rows.push({
    kind: "session",
    id: `session:${session.sessionId}`,
    depth,
    sessionId: session.sessionId,
    isCurrent: session.sessionId === currentSessionId,
  })

  for (const message of session.messages) {
    rows.push({
      kind: "message",
      id: `message:${message.sessionId}:${message.messageId}`,
      depth: depth + 1,
      sessionId: message.sessionId,
      messageId: message.messageId,
      role: message.record.info.role,
      preview: getMessagePreview(message),
    })

    for (const childSession of message.childSessions) {
      flattenSession(rows, childSession, currentSessionId, depth + 2)
    }
  }
}

function getMessagePreview(message: ProjectedMessageNode): string {
  if (message.record.info.role === "user") {
    return getUserMessagePreview(message.record.parts)
  }

  return getAssistantMessagePreview(message.record.parts)
}

function getUserMessagePreview(parts: readonly Part[]): string {
  const textPart = parts.find(isVisibleTextPart)
  if (textPart) {
    return truncatePreview(textPart.text)
  }

  return getFallbackPreview(parts)
}

function getAssistantMessagePreview(parts: readonly Part[]): string {
  const textPart = parts.find(isVisibleTextPart)
  if (textPart) {
    return truncatePreview(textPart.text)
  }

  const toolPart = parts.find(isToolPart)
  if (toolPart) {
    return truncatePreview(formatToolPreview(toolPart))
  }

  const reasoningPart = parts.find(hasReasoningText)
  if (reasoningPart) {
    return truncatePreview(`reasoning: ${reasoningPart.text}`)
  }

  return getFallbackPreview(parts)
}

function getFallbackPreview(parts: readonly Part[]): string {
  const partTypes = [...new Set(parts.filter((part) => !isStepMarkerPart(part)).map((part) => part.type))]
  if (partTypes.length > 0) {
    return `[${partTypes.join(", ")}]`
  }

  return "(no content)"
}

function formatToolPreview(part: ToolPart): string {
  const input = JSON.stringify(part.state.input)
  if (!input || input === "{}") {
    return `tool:${part.tool}`
  }

  return `tool:${part.tool} ${input}`
}

function isVisibleTextPart(part: Part): part is TextPart {
  return part.type === "text" && !part.synthetic && !part.ignored
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool"
}

function hasReasoningText(part: Part): part is ReasoningPart {
  return part.type === "reasoning" && part.text.trim().length > 0
}

function isStepMarkerPart(part: Part): boolean {
  return part.type === "step-start" || part.type === "step-finish"
}

function truncatePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= PREVIEW_LIMIT) return normalized || "(empty text)"
  return `${normalized.slice(0, PREVIEW_LIMIT - 1)}…`
}
