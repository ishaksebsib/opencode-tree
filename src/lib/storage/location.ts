import { createHash } from "node:crypto"
import { basename, join } from "node:path"
import type { TreeStorageScope } from "../config/plugin"

const pluginStorageDirectoryName = "opencode-tree"

export type ResolveStorageRootInput = {
  readonly projectRoot: string
  readonly stateRoot: string
  readonly storageScope: TreeStorageScope
}

export function resolveStorageRoot(input: ResolveStorageRootInput): string {
  const projectRoot = requireNonEmptyPath(input.projectRoot, "projectRoot")

  if (input.storageScope === "local") {
    return join(projectRoot, ".opencode", pluginStorageDirectoryName)
  }

  const stateRoot = requireNonEmptyPath(input.stateRoot, "stateRoot")
  return join(stateRoot, "plugins", pluginStorageDirectoryName, "projects", createProjectStorageKey(projectRoot))
}

export function createProjectStorageKey(projectRoot: string): string {
  const normalizedProjectRoot = requireNonEmptyPath(projectRoot, "projectRoot")
  const projectName = toStorageSlug(basename(normalizedProjectRoot))
  const projectHash = createHash("sha256").update(normalizedProjectRoot).digest("hex").slice(0, 12)
  return `${projectName}-${projectHash}`
}

function requireNonEmptyPath(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Missing ${label}`)
  }

  return normalized
}

function toStorageSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "project"
}
