import {
  getMessageTextReplay,
  type SessionMessageRecord,
  type SessionTranscript,
  type SessionTranscriptMap,
} from "../opencode/messages";
import type { TreeFlatRow } from "./flatten";

export type TreeBranchForkPlan = {
  readonly sessionId: string;
  readonly anchorMessageId: string;
  readonly forkMessageId: string;
  readonly appendPromptText?: string;
};

export type TreeBranchAction =
  | {
      readonly kind: "fork";
      readonly plan: TreeBranchForkPlan;
    }
  | {
      readonly kind: "switch-session";
      readonly sessionId: string;
    }
  | {
      readonly kind: "noop";
    }
  | {
      readonly kind: "show-notice";
      readonly message: string;
      readonly variant: "info" | "success" | "warning" | "error";
    };

export function isTreeBranchForkAction(
  action: TreeBranchAction,
): action is Extract<TreeBranchAction, { kind: "fork" }> {
  return action.kind === "fork";
}

export type PlanTreeBranchActionInput = {
  readonly row: TreeFlatRow | undefined;
  readonly transcripts: SessionTranscriptMap;
};

export type TreeBranchSummarySlice = {
  readonly sessionId: string;
  readonly startMessageId: string;
  readonly messages: readonly SessionMessageRecord[];
};

export type CollectTreeBranchSummarySliceInput = {
  readonly row: TreeFlatRow | undefined;
  readonly transcripts: SessionTranscriptMap;
};

export function planTreeBranchAction(input: PlanTreeBranchActionInput): TreeBranchAction {
  const row = input.row;
  if (!row) {
    return {
      kind: "show-notice",
      message: "Select a message row first.",
      variant: "info",
    };
  }

  if (row.kind === "session") {
    if (row.isDeleted) {
      return {
        kind: "noop",
      };
    }

    return {
      kind: "switch-session",
      sessionId: row.sessionId,
    };
  }

  const transcript = input.transcripts[row.sessionId];
  const record = transcript?.messageById.get(row.messageId);
  if (!record) {
    return {
      kind: "show-notice",
      message: `Message ${row.messageId} is unavailable.`,
      variant: "error",
    };
  }

  if (row.role === "user") {
    return {
      kind: "fork",
      plan: {
        sessionId: row.sessionId,
        anchorMessageId: row.messageId,
        forkMessageId: row.messageId,
        appendPromptText: getMessageTextReplay(record.parts),
      },
    };
  }

  const nextRecord = getNextSessionMessageRecord(transcript, row.messageId);
  if (!nextRecord) {
    return {
      kind: "switch-session",
      sessionId: row.sessionId,
    };
  }

  return {
    kind: "fork",
    plan: {
      sessionId: row.sessionId,
      anchorMessageId: row.messageId,
      forkMessageId: nextRecord.info.id,
    },
  };
}

export function collectTreeBranchSummarySlice(
  input: CollectTreeBranchSummarySliceInput,
): TreeBranchSummarySlice {
  const row = input.row;
  if (!row) {
    throw new Error("Select a message row first.");
  }

  if (row.kind !== "message") {
    throw new Error("Select a message row to summarize.");
  }

  const transcript = input.transcripts[row.sessionId];
  if (!transcript || transcript.status === "deleted") {
    throw new Error(`Session ${row.sessionId} is unavailable.`);
  }

  const startIndex = transcript.messageIndexById.get(row.messageId);
  if (startIndex === undefined) {
    throw new Error(`Message ${row.messageId} is unavailable.`);
  }

  return {
    sessionId: row.sessionId,
    startMessageId: row.messageId,
    messages: transcript.messages.slice(startIndex),
  };
}

function getNextSessionMessageRecord(transcript: SessionTranscript | undefined, messageId: string) {
  if (!transcript) return undefined;

  const index = transcript.messageIndexById.get(messageId);
  if (index === undefined) return undefined;
  return transcript.messages[index + 1];
}
