import { join } from "node:path"

export function getStorageRootPath(projectRoot: string): string {
  return join(projectRoot, ".opencode", "opencode-tree")
}

export function getTreesRootPath(projectRoot: string): string {
  return join(getStorageRootPath(projectRoot), "trees")
}

export function getRegistryFilePath(projectRoot: string): string {
  return join(getStorageRootPath(projectRoot), "registry.json")
}

export function getTreeDirectoryPath(projectRoot: string, treeId: string): string {
  return join(getTreesRootPath(projectRoot), treeId)
}

export function getSnapshotFilePath(projectRoot: string, treeId: string): string {
  return join(getTreeDirectoryPath(projectRoot, treeId), "snapshot.json")
}
