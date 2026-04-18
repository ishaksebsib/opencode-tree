import type { Message, OpencodeClient, Part } from "@opencode-ai/sdk/v2"
import type { TreeSnapshot } from "../storage"

export type SessionMessageRecord = {
  readonly info: Message
  readonly parts: readonly Part[]
}

export type SessionTranscript = {
  readonly sessionId: string
  readonly messages: readonly SessionMessageRecord[]
}

export type SessionTranscriptMap = Readonly<Record<string, SessionTranscript>>

export type LoadSessionMessagesPageInput = {
  readonly sessionId: string
  readonly before?: string
  readonly limit: number
}

export type SessionMessagesPage = {
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

    return {
      items: normalizePageItems((result.data ?? []).map((item) => ({ info: item.info, parts: item.parts }))),
      nextCursor: result.response.headers.get("x-next-cursor") ?? undefined,
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

    for (const item of page.items) {
      messagesById.set(item.info.id, item)
    }

    if (!page.nextCursor) {
      return {
        sessionId,
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
