/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createEffect, createMemo, createResource, createSignal, on, Show } from "solid-js";
import type { LoadSnapshotSessionTranscripts, SessionTranscriptMap } from "../opencode/messages";
import { bootstrapTree } from "./bootstrap";
import { isTreeBranchForkAction, planTreeBranchAction } from "./branch";
import type { TreeBranchSummaryDialogUI } from "./components/branch-summary-dialog";
import {
  resolveTreeRouteBodyState,
  TreeRouteBody,
  TreeRouteHelpPanel,
  TreeRouteStatusPanel,
} from "./components/tree-route-content";
import type { FlatTreeRows, TreeFlatRow } from "./flatten";
import { buildFlatRows, getMessagePreview } from "./flatten";
import type { TreeKeybinds } from "./keybinds";
import { getTreeContentWidth } from "./layout";
import {
  moveSelectionBy,
  moveSelectionDown,
  resolveVisibleSelectionRowId,
  moveSelectionUp,
} from "./navigation";
import { projectSessionTree, type ProjectedSessionNode } from "./project";
import { createTreeRouteBranchController } from "./route-branching";
import { mapTreeTheme } from "./theme";
import {
  buildVisibleTree,
  getMessageRowId,
  getSessionRowId,
  type MessageRowId,
  type TreeRowId,
} from "./visible";

export type TreeRouteProps = {
  readonly client: OpencodeClient;
  readonly config: {
    readonly storageRoot?: string;
    readonly keybinds: TreeKeybinds;
    readonly linesPerJump: number;
  };
  readonly ui: Pick<TuiPluginApi["ui"], "dialog"> & TreeBranchSummaryDialogUI;
  readonly projectRoot?: string;
  readonly sessionID?: string;
  readonly theme: () => TuiThemeCurrent;
  readonly loadSessionTranscripts: LoadSnapshotSessionTranscripts;
  readonly navigateToSession: (sessionId: string) => void | Promise<void>;
};

type ProjectedTreeIndex = {
  readonly parentRowIdById: ReadonlyMap<TreeRowId, TreeRowId | undefined>;
  readonly sessionById: Readonly<Record<string, ProjectedSessionNode>>;
  readonly messagePreviewByRowId: ReadonlyMap<MessageRowId, string>;
};

export function TreeRoute(props: TreeRouteProps) {
  const [selectedRowId, setSelectedRowId] = createSignal<TreeRowId | undefined>();
  const [collapsedSessionIds, setCollapsedSessionIds] = createSignal<ReadonlySet<string>>(
    new Set(),
  );
  const [treeFocused, setTreeFocused] = createSignal(false);
  const dimensions = useTerminalDimensions();

  const theme = createMemo(() => props.theme());
  const palette = createMemo(() => mapTreeTheme(theme()));

  const bootstrapInput = createMemo(() => {
    if (!props.projectRoot || !props.config.storageRoot) return undefined;
    return {
      projectRoot: props.projectRoot,
      storageRoot: props.config.storageRoot,
      sessionID: props.sessionID,
    };
  });

  const [bootstrap] = createResource(bootstrapInput, (input) => bootstrapTree(input));

  const bootstrapErrorMessage = createMemo(() => {
    const error = bootstrap.error;
    if (!error) return undefined;
    return error instanceof Error ? error.message : String(error);
  });

  const projectedInput = createMemo(() => {
    const result = bootstrap();
    if (!result || result.kind === "missing-session-context") return undefined;
    return result;
  });

  const [projectedTreeData] = createResource(projectedInput, async (result) => {
    const transcripts = await props.loadSessionTranscripts(result.snapshot);
    const projectedTree = projectSessionTree(result.snapshot, transcripts);

    return {
      transcripts,
      projectedTree,
    } satisfies {
      transcripts: SessionTranscriptMap;
      projectedTree: ReturnType<typeof projectSessionTree>;
    };
  });

  const projectedErrorMessage = createMemo(() => {
    const error = projectedTreeData.error;
    if (!error) return undefined;
    return error instanceof Error ? error.message : String(error);
  });

  const projectedTreeIndex = createMemo<ProjectedTreeIndex | undefined>(() => {
    const treeData = projectedTreeData();
    if (!treeData) return undefined;
    return buildProjectedTreeIndex(treeData.projectedTree);
  });
  const visibleTree = createMemo(() => {
    const treeData = projectedTreeData();
    const treeIndex = projectedTreeIndex();
    if (!treeData || !treeIndex) return undefined;

    return buildVisibleTree(
      treeData.projectedTree,
      {
        collapsedSessionIds: collapsedSessionIds(),
      },
      treeIndex.parentRowIdById,
    );
  });
  const flatTree = createMemo<FlatTreeRows | undefined>(() => {
    const nextVisibleTree = visibleTree();
    const treeIndex = projectedTreeIndex();
    if (!nextVisibleTree) return undefined;
    return buildFlatRows(nextVisibleTree.root, props.sessionID ?? "", {
      messagePreviewByRowId: treeIndex?.messagePreviewByRowId,
    });
  });
  const rows = createMemo<readonly TreeFlatRow[]>(() => flatTree()?.rows ?? []);
  const selectedIndex = createMemo(() => {
    const rowId = selectedRowId();
    if (!rowId) return undefined;
    return flatTree()?.rowIndexById[rowId];
  });
  const selectedRow = createMemo(() => {
    const index = selectedIndex();
    if (index === undefined) return undefined;
    return flatTree()?.rows[index];
  });
  const treeWidth = createMemo(() => getTreeContentWidth(dimensions().width));
  const bodyState = createMemo(() =>
    resolveTreeRouteBodyState({
      projectRoot: props.projectRoot,
      bootstrapLoading: bootstrap.loading,
      bootstrapErrorMessage: bootstrapErrorMessage(),
      missingSessionContext: bootstrap()?.kind === "missing-session-context",
      projectedLoading: Boolean(projectedInput()) && projectedTreeData.loading,
      projectedErrorMessage: projectedErrorMessage(),
      rows: rows(),
    }),
  );
  const branchController = createTreeRouteBranchController({
    client: props.client,
    keybinds: props.config.keybinds,
    ui: props.ui,
    theme,
    navigateToSession: props.navigateToSession,
    bootstrap,
    projectedTreeData,
    selectedRow,
  });

  createEffect(
    on(flatTree, (nextFlatTree) => {
      const nextVisibleTree = visibleTree();

      if (!nextFlatTree || !nextVisibleTree) {
        setSelectedRowId(undefined);
        return;
      }

      setSelectedRowId((currentSelectedRowId) =>
        resolveVisibleSelectionRowId({
          flatTree: nextFlatTree,
          currentSessionId: props.sessionID,
          parentRowIdById: nextVisibleTree.parentRowIdById,
          preferredRowId: currentSelectedRowId,
        }),
      );
    }),
  );

  useKeyboard((evt) => {
    if (evt.defaultPrevented) return;

    const currentBusyState = branchController.busyState();
    if (currentBusyState?.kind === "summarizing" && props.config.keybinds.match("back", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      currentBusyState.controller.abort();
      return;
    }

    if (!treeFocused()) return;

    if (props.ui.dialog.open) return;

    if (branchController.busy()) return;

    if (props.config.keybinds.match("back", evt)) {
      if (!props.sessionID) return;
      evt.preventDefault();
      evt.stopPropagation();
      void props.navigateToSession(props.sessionID);
      return;
    }

    if (rows().length === 0) return;

    if (props.config.keybinds.match("jump_up", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      updateSelectedRowId((currentIndex) =>
        moveSelectionBy(rows(), currentIndex, -props.config.linesPerJump),
      );
      return;
    }

    if (props.config.keybinds.match("jump_down", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      updateSelectedRowId((currentIndex) =>
        moveSelectionBy(rows(), currentIndex, props.config.linesPerJump),
      );
      return;
    }

    if (props.config.keybinds.match("move_up", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      updateSelectedRowId((currentIndex) => moveSelectionUp(rows(), currentIndex));
      return;
    }

    if (props.config.keybinds.match("move_down", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      updateSelectedRowId((currentIndex) => moveSelectionDown(rows(), currentIndex));
      return;
    }

    if (props.config.keybinds.match("collapse", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      const targetSessionRow = getSelectedSessionRow();
      if (!targetSessionRow || !targetSessionRow.isCollapsible || targetSessionRow.isCollapsed)
        return;
      setCollapsedSessionIds((current) => new Set(current).add(targetSessionRow.sessionId));
      return;
    }

    if (props.config.keybinds.match("expand", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      const targetSessionRow = getSelectedSessionRow();
      if (!targetSessionRow || !targetSessionRow.isCollapsible || !targetSessionRow.isCollapsed)
        return;
      const nextSelectedRowId = getExpandedSessionFocusRowId(targetSessionRow.sessionId);
      setCollapsedSessionIds((current) => {
        const next = new Set(current);
        next.delete(targetSessionRow.sessionId);
        return next;
      });
      setSelectedRowId(nextSelectedRowId);
      return;
    }

    if (props.config.keybinds.match("select", evt)) {
      const treeData = projectedTreeData();
      if (!treeData) return;

      evt.preventDefault();
      evt.stopPropagation();
      const action = planTreeBranchAction({
        row: selectedRow(),
        transcripts: treeData.transcripts,
      });

      if (isTreeBranchForkAction(action)) {
        branchController.openBranchSummaryDialog(action);
        return;
      }

      branchController.runTreeBranchAction(action);
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={1}
      gap={0}
      backgroundColor={palette().screenBackground}
    >
      <TreeRouteHelpPanel
        palette={palette()}
        busy={branchController.busy()}
        moveUpKeybind={props.config.keybinds.print("move_up")}
        moveDownKeybind={props.config.keybinds.print("move_down")}
        collapseKeybind={props.config.keybinds.print("collapse")}
        expandKeybind={props.config.keybinds.print("expand")}
        selectKeybind={props.config.keybinds.print("select")}
        backKeybind={props.config.keybinds.print("back")}
      />

      <Show when={branchController.actionErrorMessage()} keyed>
        {(message: string) => (
          <TreeRouteStatusPanel
            palette={palette()}
            tone="error"
            message={`Action error: ${message}`}
          />
        )}
      </Show>

      <TreeRouteBody
        state={bodyState()}
        palette={palette()}
        theme={theme}
        selectedIndex={selectedIndex()}
        treeWidth={treeWidth()}
        onFocusChange={setTreeFocused}
      />
    </box>
  );

  function updateSelectedRowId(
    getNextIndex: (currentIndex: number | undefined) => number | undefined,
  ): void {
    const nextIndex = getNextIndex(selectedIndex());
    if (nextIndex === undefined) return;
    const nextRow = rows()[nextIndex];
    if (!nextRow) return;
    setSelectedRowId(nextRow.id);
  }

  function getSelectedSessionRow(): Extract<TreeFlatRow, { kind: "session" }> | undefined {
    const row = selectedRow();
    if (!row) return undefined;

    const targetRowIndex = flatTree()?.rowIndexById[getSessionRowId(row.sessionId)];
    if (targetRowIndex === undefined) return undefined;

    const targetRow = rows()[targetRowIndex];
    if (!targetRow || targetRow.kind !== "session") return undefined;

    return targetRow;
  }

  function getExpandedSessionFocusRowId(sessionId: string): TreeRowId {
    const session = projectedTreeIndex()?.sessionById[sessionId];
    const firstMessage = session?.messages[0];
    if (firstMessage) {
      return getMessageRowId(sessionId, firstMessage.messageId);
    }

    return getSessionRowId(sessionId);
  }
}

function buildProjectedTreeIndex(root: ProjectedSessionNode): ProjectedTreeIndex {
  const parentRowIdById = new Map<TreeRowId, TreeRowId | undefined>();
  const sessionById: Record<string, ProjectedSessionNode> = {};
  const messagePreviewByRowId = new Map<MessageRowId, string>();

  indexProjectedTree(root, undefined, parentRowIdById, sessionById, messagePreviewByRowId);

  return {
    parentRowIdById,
    sessionById,
    messagePreviewByRowId,
  };
}

function indexProjectedTree(
  session: ProjectedSessionNode,
  parentRowId: TreeRowId | undefined,
  parentRowIdById: Map<TreeRowId, TreeRowId | undefined>,
  sessionById: Record<string, ProjectedSessionNode>,
  messagePreviewByRowId: Map<MessageRowId, string>,
): void {
  const sessionRowId = getSessionRowId(session.sessionId);
  parentRowIdById.set(sessionRowId, parentRowId);
  sessionById[session.sessionId] = session;

  for (const childSession of session.childSessions) {
    indexProjectedTree(
      childSession,
      sessionRowId,
      parentRowIdById,
      sessionById,
      messagePreviewByRowId,
    );
  }

  for (const message of session.messages) {
    const messageRowId = getMessageRowId(message.sessionId, message.messageId);
    parentRowIdById.set(messageRowId, sessionRowId);
    messagePreviewByRowId.set(messageRowId, getMessagePreview(message));

    for (const childSession of message.childSessions) {
      indexProjectedTree(
        childSession,
        messageRowId,
        parentRowIdById,
        sessionById,
        messagePreviewByRowId,
      );
    }
  }
}
