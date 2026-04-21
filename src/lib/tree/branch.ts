import { getMessageTextReplay, type SessionTranscript, type SessionTranscriptMap } from "../opencode/messages"
import type { TreeFlatRow } from "./flatten"

export type TreeBranchAction =
  | {
      readonly kind: "fork"
      readonly sessionId: string
      readonly anchorMessageId: string
      readonly forkMessageId: string
      readonly appendPromptText?: string
    }
  | {
      readonly kind: "switch-session"
      readonly sessionId: string
    }
  | {
      readonly kind: "noop"
    }
  | {
      readonly kind: "show-notice"
      readonly message: string
      readonly variant: "info" | "success" | "warning" | "error"
    }

export type PlanTreeBranchActionInput = {
  readonly row: TreeFlatRow | undefined
  readonly transcripts: SessionTranscriptMap
}

export function planTreeBranchAction(input: PlanTreeBranchActionInput): TreeBranchAction {
  const row = input.row
  if (!row) {
    return {
      kind: "show-notice",
      message: "Select a message row first.",
      variant: "info",
    }
  }

  if (row.kind === "session") {
    if (row.isDeleted) {
      return {
        kind: "noop",
      }
    }

    return {
      kind: "switch-session",
      sessionId: row.sessionId,
    }
  }

  const transcript = input.transcripts[row.sessionId]
  const record = transcript?.messageById.get(row.messageId)
  if (!record) {
    return {
      kind: "show-notice",
      message: `Message ${row.messageId} is unavailable.`,
      variant: "error",
    }
  }

  if (row.role === "user") {
    return {
      kind: "fork",
      sessionId: row.sessionId,
      anchorMessageId: row.messageId,
      forkMessageId: row.messageId,
      appendPromptText: getMessageTextReplay(record.parts),
    }
  }

  const nextRecord = getNextSessionMessageRecord(transcript, row.messageId)
  if (!nextRecord) {
    return {
      kind: "switch-session",
      sessionId: row.sessionId,
    }
  }

  return {
    kind: "fork",
    sessionId: row.sessionId,
    anchorMessageId: row.messageId,
    forkMessageId: nextRecord.info.id,
  }
}

function getNextSessionMessageRecord(
  transcript: SessionTranscript | undefined,
  messageId: string,
) {
  if (!transcript) return undefined

  const index = transcript.messageIndexById.get(messageId)
  if (index === undefined) return undefined
  return transcript.messages[index + 1]
}
