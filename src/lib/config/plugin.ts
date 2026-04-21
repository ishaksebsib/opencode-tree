import { z } from "zod"

export const treeStorageScopeSchema = z.enum(["global", "local"])

export type TreeStorageScope = z.infer<typeof treeStorageScopeSchema>

const treePluginOptionsSchema = z
  .object({
    storageScope: treeStorageScopeSchema.default("global"),
  })
  .passthrough()

export type TreePluginOptions = {
  readonly storageScope: TreeStorageScope
}

export function parseTreePluginOptions(options: unknown): TreePluginOptions {
  const parsed = treePluginOptionsSchema.parse(options ?? {})
  return {
    storageScope: parsed.storageScope,
  }
}
