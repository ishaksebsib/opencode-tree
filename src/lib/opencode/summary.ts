import type { OpencodeClient, Part } from "@opencode-ai/sdk/v2"

// NOTE: The prompt definitions below are adapted from a PI coding agent codebase.
// Original reference:
// Commit: 81f4cdf3
// Author: Mario Zechner
// Date: 2025-12-30
// Description: "Extract shared compaction/branch-summarization utils"

export const TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`

export const TREE_BRANCH_SUMMARY_INSTRUCTIONS = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`

export const TREE_BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`

export type BuildTreeBranchSummaryPromptInput = {
  readonly conversation: string
  readonly customInstructions?: string
}

export type GenerateTreeBranchSummaryInput = {
  readonly projectRoot: string
  readonly conversation: string
  readonly customInstructions?: string
  readonly agent?: string
  readonly signal?: AbortSignal
  readonly model?: {
    readonly providerID: string
    readonly modelID: string
  }
}

export type GenerateTreeBranchSummaryDependencies = {
  readonly client: OpencodeClient
}

export function buildTreeBranchSummaryInstructions(customInstructions?: string): string {
  const normalizedCustomInstructions = customInstructions?.trim()
  if (!normalizedCustomInstructions) {
    return TREE_BRANCH_SUMMARY_INSTRUCTIONS
  }

  return `${TREE_BRANCH_SUMMARY_INSTRUCTIONS}\n\nAdditional focus: ${normalizedCustomInstructions}`
}

export function buildTreeBranchSummaryPrompt(input: BuildTreeBranchSummaryPromptInput): string {
  return `<conversation>\n${input.conversation}\n</conversation>\n\n${buildTreeBranchSummaryInstructions(input.customInstructions)}`
}

export function buildTreeBranchSummaryMessage(summary: string): string {
  const normalizedSummary = summary.trim()
  return `${TREE_BRANCH_SUMMARY_PREAMBLE}${normalizedSummary}`
}

export async function generateTreeBranchSummary(
  input: GenerateTreeBranchSummaryInput,
  dependencies: GenerateTreeBranchSummaryDependencies,
): Promise<string> {
  let helperSessionId: string | undefined
  let summary: string | undefined
  let generationError: Error | undefined
  let getAbortPromise = () => undefined as Promise<void> | undefined
  let detachAbortListener = () => {}

  try {
    const helperSession = input.signal
      ? await dependencies.client.session.create(
          {
            directory: input.projectRoot,
            title: "Tree branch summary",
          },
          { signal: input.signal },
        )
      : await dependencies.client.session.create({
          directory: input.projectRoot,
          title: "Tree branch summary",
        })

    if (helperSession.error) {
      throw createSessionSummaryError("create summary helper session", helperSession.error, helperSession.response?.status)
    }

    helperSessionId = helperSession.data?.id
    if (!helperSessionId) {
      throw new Error("Summary helper session creation did not return a session ID")
    }

    ;({ getAbortPromise, detachAbortListener } = trackSummaryAbort({
      signal: input.signal,
      sessionId: helperSessionId,
      projectRoot: input.projectRoot,
      client: dependencies.client,
    }))

    const promptParameters = {
      sessionID: helperSessionId,
      directory: input.projectRoot,
      system: TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
      agent: input.agent,
      model: input.model,
      parts: [
        {
          type: "text" as const,
          text: buildTreeBranchSummaryPrompt({
            conversation: input.conversation,
            customInstructions: input.customInstructions,
          }),
        },
      ],
    }

    const promptResult = await promptSummaryWithCancellation({
      signal: input.signal,
      getAbortPromise,
      prompt: () =>
        input.signal
          ? dependencies.client.session.prompt(promptParameters, { signal: input.signal })
          : dependencies.client.session.prompt(promptParameters),
    })

    if (promptResult.error) {
      throw createSessionSummaryError("generate branch summary", promptResult.error, promptResult.response?.status)
    }

    summary = extractSummaryText(promptResult.data?.parts ?? [])
    if (!summary) {
      throw new Error("Summary helper session returned no text")
    }
  } catch (error) {
    generationError = toSummaryGenerationError(error)
  } finally {
    detachAbortListener()
  }

  let cleanupError: Error | undefined

  if (helperSessionId) {
    try {
      const abortPromise = getAbortPromise()
      if (abortPromise) {
        await abortPromise
      }

      await deleteSummaryHelperSession(helperSessionId, input.projectRoot, dependencies.client)
    } catch (error) {
      cleanupError = toError(error)
    }
  }

  if (generationError && cleanupError) {
    throw new Error(`${generationError.message}; cleanup failed: ${cleanupError.message}`)
  }

  if (cleanupError) {
    throw cleanupError
  }

  if (generationError) {
    throw generationError
  }

  if (!summary) {
    throw new Error("Summary helper session returned no text")
  }

  return summary
}

function extractSummaryText(parts: readonly Part[]): string | undefined {
  const text = parts.reduce((result, part) => {
    if (part.type !== "text" || part.synthetic || part.ignored) return result
    return result + part.text
  }, "")

  const normalized = text.trim()
  return normalized.length > 0 ? normalized : undefined
}

function createSessionSummaryError(action: string, error: unknown, statusCode?: number): Error {
  const prefix = `Failed to ${action}`
  const message = getApiErrorMessage(error)

  if (statusCode !== undefined && message) {
    return new Error(`${prefix} (${statusCode}): ${message}`)
  }

  if (statusCode !== undefined) {
    return new Error(`${prefix} (${statusCode})`)
  }

  if (message) {
    return new Error(`${prefix}: ${message}`)
  }

  return new Error(prefix)
}

async function deleteSummaryHelperSession(sessionId: string, projectRoot: string, client: OpencodeClient): Promise<void> {
  const deleteResult = await client.session.delete({
    sessionID: sessionId,
    directory: projectRoot,
  })

  if (deleteResult.error) {
    throw createSessionSummaryError("delete summary helper session", deleteResult.error, deleteResult.response?.status)
  }

  if (deleteResult.data !== true) {
    throw new Error("Summary helper session deletion did not succeed")
  }
}

function trackSummaryAbort(input: {
  readonly signal?: AbortSignal
  readonly sessionId: string
  readonly projectRoot: string
  readonly client: OpencodeClient
}): {
  readonly getAbortPromise: () => Promise<void> | undefined
  readonly detachAbortListener: () => void
} {
  if (!input.signal) {
    return {
      getAbortPromise: () => undefined,
      detachAbortListener: () => {},
    }
  }

  let abortPromise: Promise<void> | undefined
  const abort = () => {
    abortPromise ??= abortSummaryHelperSession(input.sessionId, input.projectRoot, input.client)
    return abortPromise
  }

  if (input.signal.aborted) {
    abort()
    return {
      getAbortPromise: () => abortPromise,
      detachAbortListener: () => {},
    }
  }

  const onAbort = () => {
    abort()
  }

  input.signal.addEventListener("abort", onAbort, { once: true })

  return {
    getAbortPromise: () => {
      return abortPromise
    },
    detachAbortListener: () => {
      input.signal?.removeEventListener("abort", onAbort)
    },
  }
}

async function promptSummaryWithCancellation<T>(input: {
  readonly signal?: AbortSignal
  readonly getAbortPromise: () => Promise<void> | undefined
  readonly prompt: () => Promise<T>
}): Promise<T> {
  const promptPromise = input.prompt()

  if (!input.signal) {
    return promptPromise
  }

  void promptPromise.catch(() => undefined)

  const result = await Promise.race([
    promptPromise,
    waitForSummaryAbort(input.signal, input.getAbortPromise),
  ])

  if (input.signal.aborted) {
    const abortPromise = input.getAbortPromise()
    if (abortPromise) {
      await abortPromise
    }

    throw createAbortError()
  }

  return result
}

async function waitForSummaryAbort(
  signal: AbortSignal,
  getAbortPromise: () => Promise<void> | undefined,
): Promise<never> {
  if (signal.aborted) {
    const abortPromise = getAbortPromise()
    if (abortPromise) {
      await abortPromise
    }

    throw createAbortError()
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true })
  })

  const abortPromise = getAbortPromise()
  if (abortPromise) {
    await abortPromise
  }

  throw createAbortError()
}

async function abortSummaryHelperSession(sessionId: string, projectRoot: string, client: OpencodeClient): Promise<void> {
  const abortResult = await client.session.abort({
    sessionID: sessionId,
    directory: projectRoot,
  })

  if (abortResult.error) {
    throw createSessionSummaryError("abort summary helper session", abortResult.error, abortResult.response?.status)
  }

  if (abortResult.data !== true) {
    throw new Error("Summary helper session abort did not succeed")
  }
}

function getApiErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message
    }
  }

  return undefined
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(getErrorMessage(error))
}

function toSummaryGenerationError(error: unknown): Error {
  if (isAbortError(error)) {
    return new Error("Summary generation cancelled.")
  }

  return toError(error)
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError"
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted")
  error.name = "AbortError"
  return error
}
