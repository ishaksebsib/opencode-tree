import type { ProjectedMessageNode, ProjectedSessionNode } from "./project";

export type SessionRowId = `session:${string}`;
export type MessageRowId = `message:${string}:${string}`;
export type TreeRowId = SessionRowId | MessageRowId;

export type VisibleMessageNode = {
  readonly kind: "message";
  readonly sessionId: string;
  readonly messageId: string;
  readonly record: ProjectedMessageNode["record"];
  readonly childSessions: readonly VisibleSessionNode[];
};

export type VisibleSessionNode = {
  readonly kind: "session";
  readonly sessionId: string;
  readonly status: ProjectedSessionNode["status"];
  readonly isCollapsible: boolean;
  readonly isCollapsed: boolean;
  readonly childSessions: readonly VisibleSessionNode[];
  readonly messages: readonly VisibleMessageNode[];
};

export type TreeVisibilityState = {
  readonly collapsedSessionIds: ReadonlySet<string>;
};

export type VisibleTree = {
  readonly root: VisibleSessionNode;
  readonly parentRowIdById: ReadonlyMap<TreeRowId, TreeRowId | undefined>;
};

export function buildVisibleTree(
  root: ProjectedSessionNode,
  state: TreeVisibilityState,
  parentRowIdById: ReadonlyMap<TreeRowId, TreeRowId | undefined> = buildProjectedTreeParentIndex(root),
): VisibleTree {
  const visibleRoot = buildVisibleSessionNode(root, state);

  return {
    root: visibleRoot,
    parentRowIdById,
  };
}

function buildProjectedTreeParentIndex(
  root: ProjectedSessionNode,
): ReadonlyMap<TreeRowId, TreeRowId | undefined> {
  const parentRowIdById = new Map<TreeRowId, TreeRowId | undefined>();
  indexProjectedTreeParents(root, parentRowIdById, undefined);
  return parentRowIdById;
}

function indexProjectedTreeParents(
  session: ProjectedSessionNode,
  parentRowIdById: Map<TreeRowId, TreeRowId | undefined>,
  parentRowId: TreeRowId | undefined,
): void {
  const sessionRowId = getSessionRowId(session.sessionId);
  parentRowIdById.set(sessionRowId, parentRowId);

  for (const childSession of session.childSessions) {
    indexProjectedTreeParents(childSession, parentRowIdById, sessionRowId);
  }

  for (const message of session.messages) {
    const messageRowId = getMessageRowId(message.sessionId, message.messageId);
    parentRowIdById.set(messageRowId, sessionRowId);

    for (const childSession of message.childSessions) {
      indexProjectedTreeParents(childSession, parentRowIdById, messageRowId);
    }
  }
}

export function getSessionRowId(sessionId: string): SessionRowId {
  return `session:${sessionId}`;
}

export function getMessageRowId(sessionId: string, messageId: string): MessageRowId {
  return `message:${sessionId}:${messageId}`;
}

function buildVisibleSessionNode(
  session: ProjectedSessionNode,
  state: TreeVisibilityState,
): VisibleSessionNode {
  const isCollapsible = session.childSessions.length > 0 || session.messages.length > 0;
  const isCollapsed = isCollapsible && state.collapsedSessionIds.has(session.sessionId);

  if (isCollapsed) {
    return {
      kind: "session",
      sessionId: session.sessionId,
      status: session.status,
      isCollapsible,
      isCollapsed,
      childSessions: [],
      messages: [],
    };
  }

  return {
    kind: "session",
    sessionId: session.sessionId,
    status: session.status,
    isCollapsible,
    isCollapsed: false,
    childSessions: session.childSessions.map((childSession) =>
      buildVisibleSessionNode(childSession, state),
    ),
    messages: session.messages.map((message) => buildVisibleMessageNode(message, state)),
  };
}

function buildVisibleMessageNode(
  message: ProjectedMessageNode,
  state: TreeVisibilityState,
): VisibleMessageNode {
  return {
    kind: "message",
    sessionId: message.sessionId,
    messageId: message.messageId,
    record: message.record,
    childSessions: message.childSessions.map((childSession) =>
      buildVisibleSessionNode(childSession, state),
    ),
  };
}
