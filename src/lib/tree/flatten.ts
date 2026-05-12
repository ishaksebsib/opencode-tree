import type { Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk/v2";
import {
  getMessageRowId,
  getSessionRowId,
  type MessageRowId,
  type TreeRowId,
  type VisibleMessageNode,
  type VisibleSessionNode,
} from "./visible";

export type SessionFlatRow = {
  readonly kind: "session";
  readonly id: TreeRowId;
  readonly depth: number;
  readonly sessionId: string;
  readonly currentSessionId: string;
  readonly title: string;
  readonly isDeleted: boolean;
  readonly isCollapsible: boolean;
  readonly isCollapsed: boolean;
};

export type MessageFlatRow = {
  readonly kind: "message";
  readonly id: TreeRowId;
  readonly depth: number;
  readonly sessionId: string;
  readonly currentSessionId: string;
  readonly messageId: string;
  readonly role: VisibleMessageNode["record"]["info"]["role"];
  readonly preview: string;
};

export type TreeFlatRow = SessionFlatRow | MessageFlatRow;

export type FlatTreeRows = {
  readonly rows: readonly TreeFlatRow[];
  readonly rowIndexById: Readonly<Record<TreeRowId, number>>;
  readonly lastRowIndexBySessionId: Readonly<Record<string, number>>;
};

export type BuildFlatRowsOptions = {
  readonly messagePreviewByRowId?: ReadonlyMap<MessageRowId, string>;
};

export function buildFlatRows(
  root: VisibleSessionNode,
  currentSessionId: string,
  options: BuildFlatRowsOptions = {},
): FlatTreeRows {
  const rows: TreeFlatRow[] = [];
  const rowIndexById = {} as Record<TreeRowId, number>;
  const lastRowIndexBySessionId: Record<string, number> = {};

  flattenSession(rows, rowIndexById, lastRowIndexBySessionId, root, currentSessionId, 0, options);

  return {
    rows,
    rowIndexById,
    lastRowIndexBySessionId,
  };
}

function flattenSession(
  rows: TreeFlatRow[],
  rowIndexById: Record<TreeRowId, number>,
  lastRowIndexBySessionId: Record<string, number>,
  session: VisibleSessionNode,
  currentSessionId: string,
  depth: number,
  options: BuildFlatRowsOptions,
): void {
  pushRow(rows, rowIndexById, lastRowIndexBySessionId, {
    kind: "session",
    id: getSessionRowId(session.sessionId),
    depth,
    sessionId: session.sessionId,
    currentSessionId,
    title: session.sessionId,
    isDeleted: session.status === "deleted",
    isCollapsible: session.isCollapsible,
    isCollapsed: session.isCollapsed,
  });

  for (const childSession of session.childSessions) {
    flattenSession(
      rows,
      rowIndexById,
      lastRowIndexBySessionId,
      childSession,
      currentSessionId,
      depth + 1,
      options,
    );
  }

  for (const message of session.messages) {
    const messageRowId = getMessageRowId(message.sessionId, message.messageId);
    pushRow(rows, rowIndexById, lastRowIndexBySessionId, {
      kind: "message",
      id: messageRowId,
      depth: depth + 1,
      sessionId: message.sessionId,
      currentSessionId,
      messageId: message.messageId,
      role: message.record.info.role,
      preview: options.messagePreviewByRowId?.get(messageRowId) ?? getMessagePreview(message),
    });

    for (const childSession of message.childSessions) {
      flattenSession(
        rows,
        rowIndexById,
        lastRowIndexBySessionId,
        childSession,
        currentSessionId,
        depth + 2,
        options,
      );
    }
  }
}

function pushRow(
  rows: TreeFlatRow[],
  rowIndexById: Record<TreeRowId, number>,
  lastRowIndexBySessionId: Record<string, number>,
  row: TreeFlatRow,
): void {
  rows.push(row);
  rowIndexById[row.id] = rows.length - 1;
  lastRowIndexBySessionId[row.sessionId] = rows.length - 1;
}

export function getMessagePreview(message: Pick<VisibleMessageNode, "record">): string {
  const previewParts = collectPreviewParts(message.record.parts);

  if (previewParts.textPart) {
    return normalizePreviewText(previewParts.textPart.text);
  }

  if (message.record.info.role === "assistant") {
    if (previewParts.toolPart) {
      return normalizePreviewText(formatToolPreview(previewParts.toolPart));
    }

    if (previewParts.reasoningPart) {
      return normalizePreviewText(`reasoning: ${previewParts.reasoningPart.text}`);
    }
  }

  if (previewParts.fallbackPartTypes.length > 0) {
    return `[${previewParts.fallbackPartTypes.join(", ")}]`;
  }

  return "(no content)";
}

function collectPreviewParts(parts: readonly Part[]): {
  textPart?: TextPart;
  toolPart?: ToolPart;
  reasoningPart?: ReasoningPart;
  fallbackPartTypes: readonly string[];
} {
  const fallbackPartTypes: string[] = [];
  const seenFallbackPartTypes = new Set<string>();
  let textPart: TextPart | undefined;
  let toolPart: ToolPart | undefined;
  let reasoningPart: ReasoningPart | undefined;

  for (const part of parts) {
    if (part.type === "text" && !part.synthetic && !part.ignored) {
      textPart ??= part;
    } else if (part.type === "tool") {
      toolPart ??= part;
    } else if (part.type === "reasoning" && part.text.trim().length > 0) {
      reasoningPart ??= part;
    }

    if (part.type === "step-start" || part.type === "step-finish") {
      continue;
    }

    if (seenFallbackPartTypes.has(part.type)) {
      continue;
    }

    seenFallbackPartTypes.add(part.type);
    fallbackPartTypes.push(part.type);
  }

  return {
    textPart,
    toolPart,
    reasoningPart,
    fallbackPartTypes,
  };
}

function formatToolPreview(part: ToolPart): string {
  const inputPreview = getToolInputPreview(part.state.input);
  if (!inputPreview) {
    return `tool:${part.tool}`;
  }

  return `tool:${part.tool} ${inputPreview}`;
}

function getToolInputPreview(input: Record<string, unknown>): string | undefined {
  const keys = Object.keys(input);
  if (keys.length === 0) return undefined;

  const firstKey = keys[0];
  if (!firstKey) return undefined;

  const value = input[firstKey];
  const valueText = formatToolInputValue(value);
  if (!valueText) return firstKey;

  return `${firstKey}=${valueText}`;
}

function formatToolInputValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";

  if (Array.isArray(value) || typeof value === "object") {
    const json = JSON.stringify(value);
    return json ?? undefined;
  }

  return undefined;
}

function normalizePreviewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized || "(empty text)";
}
