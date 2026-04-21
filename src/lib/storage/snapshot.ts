import { readJsonFile, writeJsonFile } from "./file"
import { getSnapshotFilePath } from "./paths"
import { snapshotSchema, type TreeSnapshot } from "./schema"

export async function readSnapshot(storageRoot: string, treeId: string): Promise<TreeSnapshot> {
  return readJsonFile(getSnapshotFilePath(storageRoot, treeId), snapshotSchema)
}

export async function writeSnapshot(
  storageRoot: string,
  snapshot: TreeSnapshot,
): Promise<TreeSnapshot> {
  return writeJsonFile(getSnapshotFilePath(storageRoot, snapshot.treeId), snapshotSchema, snapshot)
}

export function appendChildSession(
  snapshot: TreeSnapshot,
  input: {
    sessionId: string
    parentSessionId: string
    anchorMessageId: string
  },
): TreeSnapshot {
  const parent = snapshot.sessions[input.parentSessionId]
  if (!parent) {
    throw new Error(`Missing parent session ${input.parentSessionId}`)
  }

  const existingSession = snapshot.sessions[input.sessionId]
  if (existingSession) {
    const sameParent = existingSession.parentSessionId === input.parentSessionId
    const sameAnchor = existingSession.anchorMessageId === input.anchorMessageId
    const listedByParent = parent.children.includes(input.sessionId)

    if (sameParent && sameAnchor && listedByParent) {
      return snapshot
    }

    throw new Error(
      `Session ${input.sessionId} is already attached to parent ${existingSession.parentSessionId ?? "<root>"} at anchor ${existingSession.anchorMessageId ?? "<root>"}`,
    )
  }

  return {
    ...snapshot,
    sessions: {
      ...snapshot.sessions,
      [input.parentSessionId]: {
        ...parent,
        children: [...parent.children, input.sessionId],
      },
      [input.sessionId]: {
        sessionId: input.sessionId,
        parentSessionId: input.parentSessionId,
        anchorMessageId: input.anchorMessageId,
        children: [],
      },
    },
  }
}
