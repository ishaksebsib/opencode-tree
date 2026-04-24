import type { TuiState } from "@opencode-ai/plugin/tui";
import type { SessionTranscript, SessionTranscriptMap } from "../opencode/messages";
import type { TreeSnapshot } from "../storage";

export type OpenCodePathState = Pick<TuiState["path"], "worktree" | "directory">;

export type ProjectedMessageNode = {
  readonly kind: "message";
  readonly sessionId: string;
  readonly messageId: string;
  readonly record: SessionTranscriptMap[string]["messages"][number];
  readonly childSessions: readonly ProjectedSessionNode[];
};

export type ProjectedSessionNode = {
  readonly kind: "session";
  readonly sessionId: string;
  readonly status: SessionTranscript["status"];
  readonly childSessions: readonly ProjectedSessionNode[];
  readonly messages: readonly ProjectedMessageNode[];
};

export function resolveProjectRoot(path: OpenCodePathState): string | undefined {
  const worktree = path.worktree.trim();
  if (worktree) return worktree;

  const directory = path.directory.trim();
  return directory || undefined;
}

export function projectSessionTree(
  snapshot: TreeSnapshot,
  transcripts: SessionTranscriptMap,
): ProjectedSessionNode {
  return projectSessionNode(snapshot, transcripts, snapshot.rootSessionId);
}

function projectSessionNode(
  snapshot: TreeSnapshot,
  transcripts: SessionTranscriptMap,
  sessionId: string,
): ProjectedSessionNode {
  const snapshotSession = snapshot.sessions[sessionId];
  if (!snapshotSession) {
    throw new Error(`Missing snapshot session ${sessionId}`);
  }

  const transcript = transcripts[sessionId];
  if (!transcript) {
    throw new Error(`Missing transcript for session ${sessionId}`);
  }

  if (transcript.status === "deleted") {
    return {
      kind: "session",
      sessionId,
      status: "deleted",
      childSessions: snapshotSession.children.map((childSessionId) =>
        projectSessionNode(snapshot, transcripts, childSessionId),
      ),
      messages: [],
    };
  }

  const hiddenPrefixCount = getHiddenPrefixCount(snapshot, transcripts, sessionId);
  const childrenByAnchor = getChildrenByAnchor(
    snapshot,
    transcript,
    snapshotSession.children,
    sessionId,
  );
  const messages = transcript.messages.slice(hiddenPrefixCount).map((record) => {
    const anchoredChildIds = childrenByAnchor.get(record.info.id) ?? [];

    return {
      kind: "message",
      sessionId,
      messageId: record.info.id,
      record,
      childSessions: anchoredChildIds.map((childSessionId) =>
        projectSessionNode(snapshot, transcripts, childSessionId),
      ),
    } satisfies ProjectedMessageNode;
  });

  return {
    kind: "session",
    sessionId,
    status: "available",
    childSessions: [],
    messages,
  };
}

function getHiddenPrefixCount(
  snapshot: TreeSnapshot,
  transcripts: SessionTranscriptMap,
  sessionId: string,
): number {
  const snapshotSession = snapshot.sessions[sessionId];
  if (!snapshotSession) {
    throw new Error(`Missing snapshot session ${sessionId}`);
  }

  if (!snapshotSession.parentSessionId || !snapshotSession.anchorMessageId) {
    return 0;
  }

  const parentTranscript = transcripts[snapshotSession.parentSessionId];
  if (!parentTranscript) {
    throw new Error(`Missing transcript for parent session ${snapshotSession.parentSessionId}`);
  }

  if (parentTranscript.status === "deleted") {
    return 0;
  }

  return getInheritedPrefixCount(parentTranscript, snapshotSession.anchorMessageId);
}

function getInheritedPrefixCount(
  parentTranscript: SessionTranscript,
  anchorMessageId: string,
): number {
  const anchorIndex = parentTranscript.messageIndexById.get(anchorMessageId);
  if (anchorIndex === undefined) {
    throw new Error(
      `Anchor message ${anchorMessageId} not found in parent session ${parentTranscript.sessionId}`,
    );
  }

  const anchorRecord = parentTranscript.messages[anchorIndex];
  if (!anchorRecord) {
    throw new Error(
      `Anchor message ${anchorMessageId} not found in parent session ${parentTranscript.sessionId}`,
    );
  }

  return anchorRecord.info.role === "assistant" ? anchorIndex + 1 : anchorIndex;
}

function getChildrenByAnchor(
  snapshot: TreeSnapshot,
  transcript: SessionTranscript,
  childSessionIds: readonly string[],
  sessionId: string,
): ReadonlyMap<string, readonly string[]> {
  const childrenByAnchor = new Map<string, string[]>();

  for (const childSessionId of childSessionIds) {
    const childSession = snapshot.sessions[childSessionId];
    if (!childSession) {
      throw new Error(`Missing snapshot child session ${childSessionId}`);
    }

    const anchorMessageId = childSession.anchorMessageId;
    if (!anchorMessageId) {
      throw new Error(`Missing anchorMessageId for child session ${childSessionId}`);
    }

    if (!transcript.messageById.has(anchorMessageId)) {
      throw new Error(
        `Anchor message ${anchorMessageId} for child session ${childSessionId} not found in session ${sessionId}`,
      );
    }

    const anchoredChildren = childrenByAnchor.get(anchorMessageId);
    if (anchoredChildren) {
      anchoredChildren.push(childSessionId);
      continue;
    }

    childrenByAnchor.set(anchorMessageId, [childSessionId]);
  }

  return childrenByAnchor;
}
