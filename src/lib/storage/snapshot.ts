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
