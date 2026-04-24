import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import {
  buildTreeBranchSummaryMessage,
  generateTreeBranchSummary,
  type GenerateTreeBranchSummaryInput,
} from "./summary"
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
  readonly generateSummary?: typeof generateTreeBranchSummary
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

export type ExecuteTreeSummaryForkInput = {
  readonly plan: TreeBranchForkPlan
  readonly projectRoot: string
  readonly storageRoot: string
  readonly snapshot: TreeSnapshot
  readonly conversation: string
  readonly customInstructions?: string
  readonly signal?: AbortSignal
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
  const forkedSessionId = await forkTreeSession(input.plan, input.projectRoot, dependencies.client)
  await persistTreeFork(input.plan, forkedSessionId, input.snapshot, input.storageRoot, dependencies.storage ?? defaultStorage)

  return {
    forkedSessionId,
    appendPromptText: input.plan.appendPromptText,
  }
}

export async function executeTreeSummaryFork(
  input: ExecuteTreeSummaryForkInput,
  dependencies: ExecuteTreeBranchActionDependencies,
): Promise<void> {
  const summaryGenerator = dependencies.generateSummary ?? generateTreeBranchSummary
  const summary = await summaryGenerator(
    {
      projectRoot: input.projectRoot,
      conversation: input.conversation,
      customInstructions: input.customInstructions,
      signal: input.signal,
    } satisfies GenerateTreeBranchSummaryInput,
    { client: dependencies.client },
  )

  const forkedSessionId = await forkTreeSession(input.plan, input.projectRoot, dependencies.client)

  try {
    await injectTreeBranchSummary(forkedSessionId, summary, input.projectRoot, dependencies.client)
    await persistTreeFork(
      input.plan,
      forkedSessionId,
      input.snapshot,
      input.storageRoot,
      dependencies.storage ?? defaultStorage,
    )
  } catch (error) {
    await cleanupFailedTreeFork(forkedSessionId, input.projectRoot, dependencies.client, error)
  }

  await completeTreeForkTransition(
    {
      forkedSessionId,
      appendPromptText: input.plan.appendPromptText,
      projectRoot: input.projectRoot,
    },
    dependencies,
  )
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

async function forkTreeSession(
  plan: TreeBranchForkPlan,
  projectRoot: string,
  client: OpencodeClient,
): Promise<string> {
  const forked = await client.session.fork({
    sessionID: plan.sessionId,
    messageID: plan.forkMessageId,
    directory: projectRoot,
  })

  const forkedSessionId = forked.data?.id
  if (!forkedSessionId) {
    throw new Error("Fork request did not return a session ID")
  }

  return forkedSessionId
}

async function persistTreeFork(
  plan: TreeBranchForkPlan,
  forkedSessionId: string,
  snapshot: TreeSnapshot,
  storageRoot: string,
  storage: TreeBranchStorage,
): Promise<void> {
  const nextSnapshot = appendChildSession(snapshot, {
    sessionId: forkedSessionId,
    parentSessionId: plan.sessionId,
    anchorMessageId: plan.anchorMessageId,
  })
  const registry = await storage.readRegistry(storageRoot)
  const nextRegistry = registerSessionTree(registry, forkedSessionId, snapshot.treeId)

  await storage.writeSnapshot(storageRoot, nextSnapshot)
  await storage.writeRegistry(storageRoot, nextRegistry)
}

async function injectTreeBranchSummary(
  sessionId: string,
  summary: string,
  projectRoot: string,
  client: OpencodeClient,
): Promise<void> {
  const result = await client.session.prompt({
    sessionID: sessionId,
    directory: projectRoot,
    noReply: true,
    parts: [
      {
        type: "text",
        text: buildTreeBranchSummaryMessage(summary),
      },
    ],
  })

  if (result.error) {
    throw new Error("Failed to write summary into the new branch session")
  }
}

async function cleanupFailedTreeFork(
  forkedSessionId: string,
  projectRoot: string,
  client: OpencodeClient,
  error: unknown,
): Promise<never> {
  try {
    const result = await client.session.delete({
      sessionID: forkedSessionId,
      directory: projectRoot,
    })

    if (result.error || result.data !== true) {
      throw new Error("Failed to clean up the new branch session")
    }
  } catch (cleanupError) {
    throw new Error(`${getErrorMessage(error)}; cleanup failed: ${getErrorMessage(cleanupError)}`)
  }

  throw toError(error)
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(getErrorMessage(error))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
