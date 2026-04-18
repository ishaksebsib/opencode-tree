import type { SessionTranscriptMap } from "../opencode/messages"
import type { TreeSnapshot } from "../storage"

export type ProjectedMessageNode = {
  readonly kind: "message"
  readonly sessionId: string
  readonly messageId: string
  readonly record: SessionTranscriptMap[string]["messages"][number]
  readonly childSessions: readonly ProjectedSessionNode[]
}

export type ProjectedSessionNode = {
  readonly kind: "session"
  readonly sessionId: string
  readonly messages: readonly ProjectedMessageNode[]
}

export function projectSessionTree(
  snapshot: TreeSnapshot,
  transcripts: SessionTranscriptMap,
): ProjectedSessionNode {
  return projectSessionNode(snapshot, transcripts, snapshot.rootSessionId)
}

function projectSessionNode(
  snapshot: TreeSnapshot,
  transcripts: SessionTranscriptMap,
  sessionId: string,
): ProjectedSessionNode {
  const snapshotSession = snapshot.sessions[sessionId]
  if (!snapshotSession) {
    throw new Error(`Missing snapshot session ${sessionId}`)
  }

  const transcript = transcripts[sessionId]
  if (!transcript) {
    throw new Error(`Missing transcript for session ${sessionId}`)
  }

  const childrenByAnchor = new Map<string, readonly string[]>()
  for (const childSessionId of snapshotSession.children) {
    const childSession = snapshot.sessions[childSessionId]
    if (!childSession) {
      throw new Error(`Missing snapshot child session ${childSessionId}`)
    }

    const anchorMessageId = childSession.anchorMessageId
    if (!anchorMessageId) {
      throw new Error(`Missing anchorMessageId for child session ${childSessionId}`)
    }

    const anchoredChildren = childrenByAnchor.get(anchorMessageId) ?? []
    childrenByAnchor.set(anchorMessageId, [...anchoredChildren, childSessionId])
  }

  const seenAnchors = new Set<string>()
  const messages = transcript.messages.map((record) => {
    const anchoredChildIds = childrenByAnchor.get(record.info.id) ?? []
    if (anchoredChildIds.length > 0) {
      seenAnchors.add(record.info.id)
    }

    return {
      kind: "message",
      sessionId,
      messageId: record.info.id,
      record,
      childSessions: anchoredChildIds.map((childSessionId) => projectSessionNode(snapshot, transcripts, childSessionId)),
    } satisfies ProjectedMessageNode
  })

  for (const [anchorMessageId, childSessionIds] of childrenByAnchor.entries()) {
    if (seenAnchors.has(anchorMessageId)) continue
    throw new Error(
      `Anchor message ${anchorMessageId} for child sessions ${childSessionIds.join(", ")} not found in session ${sessionId}`,
    )
  }

  return {
    kind: "session",
    sessionId,
    messages,
  }
}
