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
