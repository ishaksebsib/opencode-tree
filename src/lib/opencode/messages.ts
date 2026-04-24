import type {
  FilePart,
  Message,
  OpencodeClient,
  Part,
  ReasoningPart,
  ToolPart,
} from "@opencode-ai/sdk/v2";
import type { TreeSnapshot } from "../storage";

export type SessionMessageRecord = {
  readonly info: Message;
  readonly parts: readonly Part[];
};

export type SessionTranscriptStatus = "available" | "deleted";

export type SessionTranscript = {
  readonly sessionId: string;
  readonly status: SessionTranscriptStatus;
  readonly messages: readonly SessionMessageRecord[];
  readonly messageById: ReadonlyMap<string, SessionMessageRecord>;
  readonly messageIndexById: ReadonlyMap<string, number>;
};

export type SessionTranscriptMap = Readonly<Record<string, SessionTranscript>>;

export type LoadSessionMessagesPageInput = {
  readonly sessionId: string;
  readonly before?: string;
  readonly limit: number;
};

export type SessionMessagesPage = {
  readonly status: SessionTranscriptStatus;
  readonly items: readonly SessionMessageRecord[];
  readonly nextCursor?: string;
};

export type LoadSessionMessagesPage = (
  input: LoadSessionMessagesPageInput,
) => Promise<SessionMessagesPage>;

export type LoadSessionTranscript = (sessionId: string) => Promise<SessionTranscript>;

export type LoadSnapshotSessionTranscripts = (
  snapshot: TreeSnapshot,
) => Promise<SessionTranscriptMap>;

export type OpenCodeMessagesLoaderOptions = {
  readonly directory?: string;
  readonly workspace?: string;
  readonly pageSize?: number;
};

//TODO: config: make this configurable later
const DEFAULT_PAGE_SIZE = 100;

function compareMessageRecords(left: SessionMessageRecord, right: SessionMessageRecord): number {
  const timeDiff = left.info.time.created - right.info.time.created;
  if (timeDiff !== 0) return timeDiff;
  return left.info.id.localeCompare(right.info.id);
}

function sortTranscriptMessages(
  messages: Iterable<SessionMessageRecord>,
): readonly SessionMessageRecord[] {
  return [...messages].sort(compareMessageRecords);
}

export function createSessionTranscript(input: {
  sessionId: string;
  status: SessionTranscriptStatus;
  messages: readonly SessionMessageRecord[];
}): SessionTranscript {
  const messageById = new Map<string, SessionMessageRecord>();
  const messageIndexById = new Map<string, number>();

  for (const [index, message] of input.messages.entries()) {
    messageById.set(message.info.id, message);
    messageIndexById.set(message.info.id, index);
  }

  return {
    sessionId: input.sessionId,
    status: input.status,
    messages: input.messages,
    messageById,
    messageIndexById,
  };
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
    });

    const statusCode = result.response?.status;

    if (statusCode === 404 || isNotFoundError(result.error)) {
      return {
        status: "deleted",
        items: [],
      };
    }

    if (result.error) {
      throw createSessionMessagesLoadError(input.sessionId, result.error, statusCode);
    }

    return {
      status: "available",
      items: (result.data ?? []).map((item) => ({ info: item.info, parts: item.parts })),
      nextCursor: result.response?.headers.get("x-next-cursor") ?? undefined,
    };
  };
}

export async function loadSessionTranscript(
  sessionId: string,
  loadPage: LoadSessionMessagesPage,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<SessionTranscript> {
  const messagesById = new Map<string, SessionMessageRecord>();
  const seenCursors = new Set<string>();

  let before: string | undefined;

  while (true) {
    const page = await loadPage({
      sessionId,
      before,
      limit: pageSize,
    });

    if (page.status === "deleted") {
      return createSessionTranscript({
        sessionId,
        status: "deleted",
        messages: [],
      });
    }

    for (const item of page.items) {
      messagesById.set(item.info.id, item);
    }

    if (!page.nextCursor) {
      return createSessionTranscript({
        sessionId,
        status: "available",
        messages: sortTranscriptMessages(messagesById.values()),
      });
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`Repeated message pagination cursor for session ${sessionId}`);
    }

    seenCursors.add(page.nextCursor);
    before = page.nextCursor;
  }
}

export async function loadSnapshotSessionTranscripts(
  snapshot: TreeSnapshot,
  loadTranscript: LoadSessionTranscript,
): Promise<SessionTranscriptMap> {
  const sessionIds = Object.keys(snapshot.sessions).sort((left, right) =>
    left.localeCompare(right),
  );
  const entries = await Promise.all(
    sessionIds.map(async (sessionId) => [sessionId, await loadTranscript(sessionId)] as const),
  );

  return Object.fromEntries(entries);
}

export function createSnapshotSessionTranscriptsLoader(
  client: OpencodeClient,
  options: OpenCodeMessagesLoaderOptions = {},
): LoadSnapshotSessionTranscripts {
  const loadPage = createSessionMessagesPageLoader(client, options);
  return (snapshot) =>
    loadSnapshotSessionTranscripts(snapshot, (sessionId) =>
      loadSessionTranscript(sessionId, loadPage, options.pageSize),
    );
}

export function getMessageTextReplay(parts: readonly Part[]): string | undefined {
  const text = collectMessageText(parts);

  return text?.length ? text : undefined;
}

export function serializeSessionMessageRecordsForSummary(
  messages: readonly SessionMessageRecord[],
): string {
  return messages
    .map(serializeSessionMessageRecordForSummary)
    .filter((blocks) => blocks.length > 0)
    .map((blocks) => blocks.join("\n"))
    .join("\n\n");
}

function serializeSessionMessageRecordForSummary(record: SessionMessageRecord): readonly string[] {
  const text = collectMessageText(record.parts);
  const files = collectMessageFiles(record.parts);
  const fallbackPartTypes = collectFallbackPartTypes(record.parts);

  if (record.info.role === "user") {
    return buildUserMessageBlocks(text, files, fallbackPartTypes);
  }

  return buildAssistantMessageBlocks({
    text,
    reasoning: collectReasoningText(record.parts),
    toolCalls: collectToolCalls(record.parts),
    files,
    fallbackPartTypes,
  });
}

function buildUserMessageBlocks(
  text: string | undefined,
  files: readonly string[],
  fallbackPartTypes: readonly string[],
): readonly string[] {
  const blocks: string[] = [];

  if (text) {
    blocks.push(`[User]: ${text}`);
  }

  if (files.length > 0) {
    blocks.push(`[User files]: ${files.join(", ")}`);
  }

  if (fallbackPartTypes.length > 0) {
    blocks.push(`[User parts]: ${fallbackPartTypes.join(", ")}`);
  }

  return blocks;
}

function buildAssistantMessageBlocks(input: {
  readonly text: string | undefined;
  readonly reasoning: string | undefined;
  readonly toolCalls: readonly string[];
  readonly files: readonly string[];
  readonly fallbackPartTypes: readonly string[];
}): readonly string[] {
  const blocks: string[] = [];

  if (input.reasoning) {
    blocks.push(`[Assistant reasoning]: ${input.reasoning}`);
  }

  if (input.text) {
    blocks.push(`[Assistant]: ${input.text}`);
  }

  if (input.toolCalls.length > 0) {
    blocks.push(`[Assistant tool calls]: ${input.toolCalls.join("; ")}`);
  }

  if (input.files.length > 0) {
    blocks.push(`[Assistant files]: ${input.files.join(", ")}`);
  }

  if (input.fallbackPartTypes.length > 0) {
    blocks.push(`[Assistant parts]: ${input.fallbackPartTypes.join(", ")}`);
  }

  return blocks;
}

function collectMessageText(parts: readonly Part[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("")
    .trim();

  return text.length > 0 ? text : undefined;
}

function collectReasoningText(parts: readonly Part[]): string | undefined {
  const reasoning = parts
    .filter((part): part is ReasoningPart => part.type === "reasoning")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n");

  return reasoning.length > 0 ? reasoning : undefined;
}

function collectToolCalls(parts: readonly Part[]): readonly string[] {
  return parts
    .filter((part): part is ToolPart => part.type === "tool")
    .map((part) => formatToolCall(part));
}

function collectMessageFiles(parts: readonly Part[]): readonly string[] {
  const labels: string[] = [];

  for (const part of parts) {
    if (part.type !== "file") continue;
    labels.push(getFilePartLabel(part));
  }

  return labels;
}

function collectFallbackPartTypes(parts: readonly Part[]): readonly string[] {
  const types: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (
      part.type === "text" ||
      part.type === "reasoning" ||
      part.type === "tool" ||
      part.type === "file"
    ) {
      continue;
    }

    if (part.type === "step-start" || part.type === "step-finish") {
      continue;
    }

    if (seen.has(part.type)) {
      continue;
    }

    seen.add(part.type);
    types.push(part.type);
  }

  return types;
}

function formatToolCall(part: ToolPart): string {
  const args = Object.entries(part.state.input)
    .map(([key, value]) => `${key}=${formatToolArgumentValue(value)}`)
    .join(", ");

  if (!args) {
    return `${part.tool}()`;
  }

  return `${part.tool}(${args})`;
}

function formatToolArgumentValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";

  if (Array.isArray(value) || typeof value === "object") {
    const json = JSON.stringify(value);
    if (json) return json;
  }

  return JSON.stringify(String(value));
}

function getFilePartLabel(part: FilePart): string {
  if (part.filename) return part.filename;

  const source = part.source;
  if (source?.type === "file" || source?.type === "symbol") {
    return source.path;
  }

  if (source?.type === "resource") {
    return source.uri;
  }

  return part.url;
}

function isNotFoundError(
  error: unknown,
): error is { readonly name: "NotFoundError"; readonly data?: { readonly message?: string } } {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "NotFoundError"
  );
}

function createSessionMessagesLoadError(
  sessionId: string,
  error: unknown,
  statusCode?: number,
): Error {
  const prefix = `Failed to load messages for session ${sessionId}`;
  const message = getSessionMessagesLoadErrorMessage(error);

  if (statusCode !== undefined && message) {
    return new Error(`${prefix} (${statusCode}): ${message}`);
  }

  if (statusCode !== undefined) {
    return new Error(`${prefix} (${statusCode})`);
  }

  if (message) {
    return new Error(`${prefix}: ${message}`);
  }

  return new Error(prefix);
}

function getSessionMessagesLoadErrorMessage(error: unknown): string | undefined {
  if (isNotFoundError(error)) {
    return error.data?.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }

  return undefined;
}
