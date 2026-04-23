import type { FilePart, Part, ReasoningPart, ToolPart } from "@opencode-ai/sdk/v2"
import type { SessionMessageRecord, SessionTranscriptMap } from "../opencode/messages"
import type { TreeFlatRow } from "./flatten"

export type TreeBranchSummarySlice = {
  readonly sessionId: string
  readonly startMessageId: string
  readonly messages: readonly SessionMessageRecord[]
}

export type CollectTreeBranchSummarySliceInput = {
  readonly row: TreeFlatRow | undefined
  readonly transcripts: SessionTranscriptMap
}

export function collectTreeBranchSummarySlice(input: CollectTreeBranchSummarySliceInput): TreeBranchSummarySlice {
  const row = input.row
  if (!row) {
    throw new Error("Select a message row first.")
  }

  if (row.kind !== "message") {
    throw new Error("Select a message row to summarize.")
  }

  const transcript = input.transcripts[row.sessionId]
  if (!transcript || transcript.status === "deleted") {
    throw new Error(`Session ${row.sessionId} is unavailable.`)
  }

  const startIndex = transcript.messageIndexById.get(row.messageId)
  if (startIndex === undefined) {
    throw new Error(`Message ${row.messageId} is unavailable.`)
  }

  return {
    sessionId: row.sessionId,
    startMessageId: row.messageId,
    messages: transcript.messages.slice(startIndex),
  }
}

export function serializeTreeBranchSummarySlice(slice: TreeBranchSummarySlice): string {
  return slice.messages
    .map(serializeSessionMessageRecord)
    .filter((blocks) => blocks.length > 0)
    .map((blocks) => blocks.join("\n"))
    .join("\n\n")
}

function serializeSessionMessageRecord(record: SessionMessageRecord): readonly string[] {
  const text = collectMessageText(record.parts)
  const files = collectMessageFiles(record.parts)
  const fallbackPartTypes = collectFallbackPartTypes(record.parts)

  if (record.info.role === "user") {
    return buildUserMessageBlocks(text, files, fallbackPartTypes)
  }

  return buildAssistantMessageBlocks({
    text,
    reasoning: collectReasoningText(record.parts),
    toolCalls: collectToolCalls(record.parts),
    files,
    fallbackPartTypes,
  })
}

function buildUserMessageBlocks(
  text: string | undefined,
  files: readonly string[],
  fallbackPartTypes: readonly string[],
): readonly string[] {
  const blocks: string[] = []

  if (text) {
    blocks.push(`[User]: ${text}`)
  }

  if (files.length > 0) {
    blocks.push(`[User files]: ${files.join(", ")}`)
  }

  if (fallbackPartTypes.length > 0) {
    blocks.push(`[User parts]: ${fallbackPartTypes.join(", ")}`)
  }

  return blocks
}

function buildAssistantMessageBlocks(input: {
  readonly text: string | undefined
  readonly reasoning: string | undefined
  readonly toolCalls: readonly string[]
  readonly files: readonly string[]
  readonly fallbackPartTypes: readonly string[]
}): readonly string[] {
  const blocks: string[] = []

  if (input.reasoning) {
    blocks.push(`[Assistant reasoning]: ${input.reasoning}`)
  }

  if (input.text) {
    blocks.push(`[Assistant]: ${input.text}`)
  }

  if (input.toolCalls.length > 0) {
    blocks.push(`[Assistant tool calls]: ${input.toolCalls.join("; ")}`)
  }

  if (input.files.length > 0) {
    blocks.push(`[Assistant files]: ${input.files.join(", ")}`)
  }

  if (input.fallbackPartTypes.length > 0) {
    blocks.push(`[Assistant parts]: ${input.fallbackPartTypes.join(", ")}`)
  }

  return blocks
}

function collectMessageText(parts: readonly Part[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("")
    .trim()

  return text.length > 0 ? text : undefined
}

function collectReasoningText(parts: readonly Part[]): string | undefined {
  const reasoning = parts
    .filter((part): part is ReasoningPart => part.type === "reasoning")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n")

  return reasoning.length > 0 ? reasoning : undefined
}

function collectToolCalls(parts: readonly Part[]): readonly string[] {
  return parts
    .filter((part): part is ToolPart => part.type === "tool")
    .map((part) => formatToolCall(part))
}

function collectMessageFiles(parts: readonly Part[]): readonly string[] {
  const labels: string[] = []

  for (const part of parts) {
    if (part.type !== "file") continue
    labels.push(getFilePartLabel(part))
  }

  return labels
}

function collectFallbackPartTypes(parts: readonly Part[]): readonly string[] {
  const types: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    if (part.type === "text" || part.type === "reasoning" || part.type === "tool" || part.type === "file") {
      continue
    }

    if (part.type === "step-start" || part.type === "step-finish") {
      continue
    }

    if (seen.has(part.type)) {
      continue
    }

    seen.add(part.type)
    types.push(part.type)
  }

  return types
}

function formatToolCall(part: ToolPart): string {
  const args = Object.entries(part.state.input)
    .map(([key, value]) => `${key}=${formatToolArgumentValue(value)}`)
    .join(", ")

  if (!args) {
    return `${part.tool}()`
  }

  return `${part.tool}(${args})`
}

function formatToolArgumentValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null) return "null"

  if (Array.isArray(value) || typeof value === "object") {
    const json = JSON.stringify(value)
    if (json) return json
  }

  return JSON.stringify(String(value))
}

function getFilePartLabel(part: FilePart): string {
  if (part.filename) return part.filename

  const source = part.source
  if (source?.type === "file" || source?.type === "symbol") {
    return source.path
  }

  if (source?.type === "resource") {
    return source.uri
  }

  return part.url
}
