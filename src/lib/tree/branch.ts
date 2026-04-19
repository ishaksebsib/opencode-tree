import type { SessionTranscriptMap } from "../opencode/messages"
import {
  getMessageTextReplay,
  getNextSessionMessageRecord,
  getSessionMessageRecord,
} from "../opencode/messages"
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

  if (row.kind !== "message") {
    return {
      kind: "show-notice",
      message: "Select a user or assistant message to branch.",
      variant: "info",
    }
  }

  const record = getSessionMessageRecord(input.transcripts, row.sessionId, row.messageId)
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

  const nextRecord = getNextSessionMessageRecord(input.transcripts, row.sessionId, row.messageId)
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
