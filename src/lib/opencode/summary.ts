import type { OpencodeClient, Part } from "@opencode-ai/sdk/v2"
import {
  buildTreeBranchSummaryPrompt,
  TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
} from "../tree/summary-prompt"

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

export async function generateTreeBranchSummary(
  input: GenerateTreeBranchSummaryInput,
  dependencies: GenerateTreeBranchSummaryDependencies,
): Promise<string> {
  let helperSessionId: string | undefined
  let summary: string | undefined
  let generationError: Error | undefined

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

    const promptResult = input.signal
      ? await dependencies.client.session.prompt(promptParameters, { signal: input.signal })
      : await dependencies.client.session.prompt(promptParameters)

    if (promptResult.error) {
      throw createSessionSummaryError("generate branch summary", promptResult.error, promptResult.response?.status)
    }

    summary = extractSummaryText(promptResult.data?.parts ?? [])
    if (!summary) {
      throw new Error("Summary helper session returned no text")
    }
  } catch (error) {
    generationError = toSummaryGenerationError(error)
  }

  let cleanupError: Error | undefined

  if (helperSessionId) {
    try {
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
