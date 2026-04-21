import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import {
  appendChildSession,
  readRegistry,
  registerSessionTree,
  writeRegistry,
  writeSnapshot,
  type TreeRegistry,
  type TreeSnapshot,
} from "../storage"
import type { TreeBranchAction } from "../tree/branch"

export type TreeBranchStorage = {
  readRegistry(storageRoot: string): Promise<TreeRegistry>
  writeRegistry(storageRoot: string, registry: TreeRegistry): Promise<TreeRegistry>
  writeSnapshot(storageRoot: string, snapshot: TreeSnapshot): Promise<TreeSnapshot>
}

export type ExecuteTreeBranchActionInput = {
  readonly action: TreeBranchAction
  readonly projectRoot: string
  readonly storageRoot: string
  readonly snapshot: TreeSnapshot
}

export type ExecuteTreeBranchActionDependencies = {
  readonly client: OpencodeClient
  readonly navigateToSession: (sessionId: string) => void | Promise<void>
  readonly storage?: TreeBranchStorage
}

const defaultStorage: TreeBranchStorage = {
  readRegistry,
  writeRegistry,
  writeSnapshot,
}

export async function executeTreeBranchAction(
  input: ExecuteTreeBranchActionInput,
  dependencies: ExecuteTreeBranchActionDependencies,
): Promise<void> {
  const storage = dependencies.storage ?? defaultStorage

  if (input.action.kind === "noop") {
    return
  }

  if (input.action.kind === "show-notice") {
    await dependencies.client.tui.showToast({
      directory: input.projectRoot,
      message: input.action.message,
      variant: input.action.variant,
    })
    return
  }

  if (input.action.kind === "switch-session") {
    await dependencies.navigateToSession(input.action.sessionId)
    return
  }

  const forked = await dependencies.client.session.fork({
    sessionID: input.action.sessionId,
    messageID: input.action.forkMessageId,
    directory: input.projectRoot,
  })

  const forkedSessionId = forked.data?.id
  if (!forkedSessionId) {
    throw new Error("Fork request did not return a session ID")
  }

  const nextSnapshot = appendChildSession(input.snapshot, {
    sessionId: forkedSessionId,
    parentSessionId: input.action.sessionId,
    anchorMessageId: input.action.anchorMessageId,
  })
  const registry = await storage.readRegistry(input.storageRoot)
  const nextRegistry = registerSessionTree(registry, forkedSessionId, input.snapshot.treeId)

  await storage.writeSnapshot(input.storageRoot, nextSnapshot)
  await storage.writeRegistry(input.storageRoot, nextRegistry)
  await dependencies.navigateToSession(forkedSessionId)

  if (!input.action.appendPromptText) return

  await waitForRouteTransition()
  await dependencies.client.tui.appendPrompt({
    directory: input.projectRoot,
    text: input.action.appendPromptText,
  })
}

function waitForRouteTransition(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
