import { readJsonFile, writeJsonFile, isFileNotFoundError } from "./file"
import { getRegistryFilePath } from "./paths"
import { createEmptyRegistry, registrySchema, type TreeRegistry } from "./schema"

export async function readRegistry(projectRoot: string): Promise<TreeRegistry> {
  const filePath = getRegistryFilePath(projectRoot)

  try {
    return await readJsonFile(filePath, registrySchema)
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return createEmptyRegistry()
    }

    throw error
  }
}

export async function writeRegistry(projectRoot: string, registry: TreeRegistry): Promise<TreeRegistry> {
  return writeJsonFile(getRegistryFilePath(projectRoot), registrySchema, registry)
}

export function registerSessionTree(registry: TreeRegistry, sessionId: string, treeId: string): TreeRegistry {
  return {
    ...registry,
    sessions: {
      ...registry.sessions,
      [sessionId]: treeId,
    },
  }
}
