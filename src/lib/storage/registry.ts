import { readJsonFile, writeJsonFile, isFileNotFoundError } from "./file"
import { getRegistryFilePath } from "./paths"
import { createEmptyRegistry, registrySchema, type TreeRegistry } from "./schema"

export async function readRegistry(storageRoot: string): Promise<TreeRegistry> {
  const filePath = getRegistryFilePath(storageRoot)

  try {
    return await readJsonFile(filePath, registrySchema)
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return createEmptyRegistry()
    }

    throw error
  }
}

export async function writeRegistry(storageRoot: string, registry: TreeRegistry): Promise<TreeRegistry> {
  return writeJsonFile(getRegistryFilePath(storageRoot), registrySchema, registry)
}

export function registerSessionTree(registry: TreeRegistry, sessionId: string, treeId: string): TreeRegistry {
  const existingTreeId = registry.sessions[sessionId]

  if (!existingTreeId) {
    return {
      ...registry,
      sessions: {
        ...registry.sessions,
        [sessionId]: treeId,
      },
    }
  }

  if (existingTreeId === treeId) {
    return registry
  }

  throw new Error(`Session ${sessionId} is already registered to tree ${existingTreeId}`)
}
