import { join } from "node:path"

export function getTreesRootPath(storageRoot: string): string {
  return join(storageRoot, "trees")
}

export function getRegistryFilePath(storageRoot: string): string {
  return join(storageRoot, "registry.json")
}

export function getTreeDirectoryPath(storageRoot: string, treeId: string): string {
  return join(getTreesRootPath(storageRoot), treeId)
}

export function getSnapshotFilePath(storageRoot: string, treeId: string): string {
  return join(getTreeDirectoryPath(storageRoot, treeId), "snapshot.json")
}
