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
import type { TreeBranchAction, TreeBranchForkPlan } from "../tree/branch"

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

export type ExecuteTreeForkPlanInput = {
  readonly plan: TreeBranchForkPlan
  readonly projectRoot: string
  readonly storageRoot: string
  readonly snapshot: TreeSnapshot
}

export type TreeForkExecutionResult = {
  readonly forkedSessionId: string
  readonly appendPromptText?: string
}

export type CompleteTreeForkTransitionInput = {
  readonly forkedSessionId: string
  readonly appendPromptText?: string
  readonly projectRoot: string
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

  const forked = await executeTreeForkPlan(
    {
      plan: input.action.plan,
      projectRoot: input.projectRoot,
      storageRoot: input.storageRoot,
      snapshot: input.snapshot,
    },
    dependencies,
  )

  await completeTreeForkTransition(
    {
      forkedSessionId: forked.forkedSessionId,
      appendPromptText: forked.appendPromptText,
      projectRoot: input.projectRoot,
    },
    dependencies,
  )
}

export async function executeTreeForkPlan(
  input: ExecuteTreeForkPlanInput,
  dependencies: ExecuteTreeBranchActionDependencies,
): Promise<TreeForkExecutionResult> {
  const storage = dependencies.storage ?? defaultStorage

  const forked = await dependencies.client.session.fork({
    sessionID: input.plan.sessionId,
    messageID: input.plan.forkMessageId,
    directory: input.projectRoot,
  })

  const forkedSessionId = forked.data?.id
  if (!forkedSessionId) {
    throw new Error("Fork request did not return a session ID")
  }

  const nextSnapshot = appendChildSession(input.snapshot, {
    sessionId: forkedSessionId,
    parentSessionId: input.plan.sessionId,
    anchorMessageId: input.plan.anchorMessageId,
  })
  const registry = await storage.readRegistry(input.storageRoot)
  const nextRegistry = registerSessionTree(registry, forkedSessionId, input.snapshot.treeId)

  await storage.writeSnapshot(input.storageRoot, nextSnapshot)
  await storage.writeRegistry(input.storageRoot, nextRegistry)

  return {
    forkedSessionId,
    appendPromptText: input.plan.appendPromptText,
  }
}

export async function completeTreeForkTransition(
  input: CompleteTreeForkTransitionInput,
  dependencies: Pick<ExecuteTreeBranchActionDependencies, "client" | "navigateToSession">,
): Promise<void> {
  await dependencies.navigateToSession(input.forkedSessionId)

  if (!input.appendPromptText) return

  await waitForRouteTransition()
  await dependencies.client.tui.appendPrompt({
    directory: input.projectRoot,
    text: input.appendPromptText,
  })
}

function waitForRouteTransition(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
