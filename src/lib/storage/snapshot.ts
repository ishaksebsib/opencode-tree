import { readJsonFile, writeJsonFile } from "./file"
import { getSnapshotFilePath } from "./paths"
import { snapshotSchema, type TreeSnapshot } from "./schema"

export async function readSnapshot(projectRoot: string, treeId: string): Promise<TreeSnapshot> {
  return readJsonFile(getSnapshotFilePath(projectRoot, treeId), snapshotSchema)
}

export async function writeSnapshot(
  projectRoot: string,
  snapshot: TreeSnapshot,
): Promise<TreeSnapshot> {
  return writeJsonFile(getSnapshotFilePath(projectRoot, snapshot.treeId), snapshotSchema, snapshot)
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

  if (snapshot.sessions[input.sessionId]) {
    throw new Error(`Session ${input.sessionId} already exists in snapshot`)
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
