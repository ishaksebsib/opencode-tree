import type { Message, OpencodeClient, Part } from "@opencode-ai/sdk/v2"
import type { TreeSnapshot } from "../storage"

export type SessionMessageRecord = {
  readonly info: Message
  readonly parts: readonly Part[]
}

export type SessionTranscriptStatus = "available" | "deleted"

export type SessionTranscript = {
  readonly sessionId: string
  readonly status: SessionTranscriptStatus
  readonly messages: readonly SessionMessageRecord[]
}

export type SessionTranscriptMap = Readonly<Record<string, SessionTranscript>>

export type LoadSessionMessagesPageInput = {
  readonly sessionId: string
  readonly before?: string
  readonly limit: number
}

export type SessionMessagesPage = {
  readonly status: SessionTranscriptStatus
  readonly items: readonly SessionMessageRecord[]
  readonly nextCursor?: string
}

export type LoadSessionMessagesPage = (
  input: LoadSessionMessagesPageInput,
) => Promise<SessionMessagesPage>

export type LoadSessionTranscript = (sessionId: string) => Promise<SessionTranscript>

export type LoadSnapshotSessionTranscripts = (
  snapshot: TreeSnapshot,
) => Promise<SessionTranscriptMap>

export type OpenCodeMessagesLoaderOptions = {
  readonly directory?: string
  readonly workspace?: string
  readonly pageSize?: number
}

//TODO: config: make this configurable later
const DEFAULT_PAGE_SIZE = 100

function compareMessageRecords(left: SessionMessageRecord, right: SessionMessageRecord): number {
  const timeDiff = left.info.time.created - right.info.time.created
  if (timeDiff !== 0) return timeDiff
  return left.info.id.localeCompare(right.info.id)
}

function normalizePageItems(items: readonly SessionMessageRecord[]): readonly SessionMessageRecord[] {
  return [...items].sort(compareMessageRecords)
}

function sortTranscriptMessages(messages: Iterable<SessionMessageRecord>): readonly SessionMessageRecord[] {
  return [...messages].sort(compareMessageRecords)
}

export function createSessionMessagesPageLoader(
  client: OpencodeClient,
  options: OpenCodeMessagesLoaderOptions = {},
): LoadSessionMessagesPage {
  return async (input) => {
    const result = await client.session.messages({
      sessionID: input.sessionId,
      directory: options.directory,
      workspace: options.workspace,
      limit: input.limit,
      before: input.before,
    })

    const statusCode = result.response?.status

    if (statusCode === 404 || isNotFoundError(result.error)) {
      return {
        status: "deleted",
        items: [],
      }
    }

    if (result.error) {
      throw createSessionMessagesLoadError(input.sessionId, result.error, statusCode)
    }

    return {
      status: "available",
      items: normalizePageItems((result.data ?? []).map((item) => ({ info: item.info, parts: item.parts }))),
      nextCursor: result.response?.headers.get("x-next-cursor") ?? undefined,
    }
  }
}

export async function loadSessionTranscript(
  sessionId: string,
  loadPage: LoadSessionMessagesPage,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<SessionTranscript> {
  const messagesById = new Map<string, SessionMessageRecord>()
  const seenCursors = new Set<string>()

  let before: string | undefined

  while (true) {
    const page = await loadPage({
      sessionId,
      before,
      limit: pageSize,
    })

    if (page.status === "deleted") {
      return {
        sessionId,
        status: "deleted",
        messages: [],
      }
    }

    for (const item of page.items) {
      messagesById.set(item.info.id, item)
    }

    if (!page.nextCursor) {
      return {
        sessionId,
        status: "available",
        messages: sortTranscriptMessages(messagesById.values()),
      }
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`Repeated message pagination cursor for session ${sessionId}`)
    }

    seenCursors.add(page.nextCursor)
    before = page.nextCursor
  }
}

export async function loadSnapshotSessionTranscripts(
  snapshot: TreeSnapshot,
  loadTranscript: LoadSessionTranscript,
): Promise<SessionTranscriptMap> {
  const sessionIds = Object.keys(snapshot.sessions).sort((left, right) => left.localeCompare(right))
  const entries = await Promise.all(sessionIds.map(async (sessionId) => [sessionId, await loadTranscript(sessionId)] as const))

  return Object.fromEntries(entries)
}

export function createSnapshotSessionTranscriptsLoader(
  client: OpencodeClient,
  options: OpenCodeMessagesLoaderOptions = {},
): LoadSnapshotSessionTranscripts {
  const loadPage = createSessionMessagesPageLoader(client, options)
  return (snapshot) => loadSnapshotSessionTranscripts(snapshot, (sessionId) => loadSessionTranscript(sessionId, loadPage, options.pageSize))
}

export function getSessionMessageRecord(
  transcripts: SessionTranscriptMap,
  sessionId: string,
  messageId: string,
): SessionMessageRecord | undefined {
  const transcript = transcripts[sessionId]
  if (!transcript) return undefined
  return transcript.messages.find((message) => message.info.id === messageId)
}

export function getNextSessionMessageRecord(
  transcripts: SessionTranscriptMap,
  sessionId: string,
  messageId: string,
): SessionMessageRecord | undefined {
  const transcript = transcripts[sessionId]
  if (!transcript) return undefined

  const index = transcript.messages.findIndex((message) => message.info.id === messageId)
  if (index < 0) return undefined
  return transcript.messages[index + 1]
}

export function getMessageTextReplay(parts: readonly Part[]): string | undefined {
  const text = parts.reduce((result, part) => {
    if (part.type !== "text" || part.synthetic || part.ignored) return result
    return result + part.text
  }, "")

  return text.length > 0 ? text : undefined
}

function isNotFoundError(error: unknown): error is { readonly name: "NotFoundError"; readonly data?: { readonly message?: string } } {
  return typeof error === "object" && error !== null && "name" in error && error.name === "NotFoundError"
}

function createSessionMessagesLoadError(sessionId: string, error: unknown, statusCode?: number): Error {
  const prefix = `Failed to load messages for session ${sessionId}`
  const message = getSessionMessagesLoadErrorMessage(error)

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

function getSessionMessagesLoadErrorMessage(error: unknown): string | undefined {
  if (isNotFoundError(error)) {
    return error.data?.message
  }

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
