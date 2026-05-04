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
import { buildFlatRows } from "./flatten";
import type { TreeKeybinds } from "./keybinds";
import { getTreeContentWidth } from "./layout";
import {
  getInitialSelectedRowIndex,
  moveSelectionBy,
  moveSelectionDown,
  moveSelectionUp,
} from "./navigation";
import { projectSessionTree } from "./project";
import { createTreeRouteBranchController } from "./route-branching";
import { mapTreeTheme } from "./theme";

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

export function TreeRoute(props: TreeRouteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal<number | undefined>();
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
    const flatTree = buildFlatRows(projectedTree, result.currentSessionId);

    return {
      transcripts,
      flatTree,
    } satisfies {
      transcripts: SessionTranscriptMap;
      flatTree: FlatTreeRows;
    };
  });

  const projectedErrorMessage = createMemo(() => {
    const error = projectedTreeData.error;
    if (!error) return undefined;
    return error instanceof Error ? error.message : String(error);
  });

  const rows = createMemo<readonly TreeFlatRow[]>(() => projectedTreeData()?.flatTree.rows ?? []);
  const selectedRow = createMemo(() => {
    const index = selectedIndex();
    if (index === undefined) return undefined;
    return rows()[index];
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
    on(projectedTreeData, (nextTreeData) => {
      const currentSessionId = props.sessionID;
      if (!currentSessionId) {
        setSelectedIndex(undefined);
        return;
      }

      if (!nextTreeData) {
        setSelectedIndex(undefined);
        return;
      }

      setSelectedIndex(getInitialSelectedRowIndex(nextTreeData.flatTree, currentSessionId));
    }),
  );

  useKeyboard((evt) => {
    if (evt.defaultPrevented) return;

    const currentBusyState = branchController.busyState();
    if (
      currentBusyState?.kind === "summarizing" &&
      (evt.name === "escape" || (evt.ctrl && evt.name === "c"))
    ) {
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
      setSelectedIndex((currentIndex) =>
        moveSelectionBy(rows(), currentIndex, -props.config.linesPerJump),
      );
      return;
    }

    if (props.config.keybinds.match("jump_down", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedIndex((currentIndex) =>
        moveSelectionBy(rows(), currentIndex, props.config.linesPerJump),
      );
      return;
    }

    if (props.config.keybinds.match("move_up", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedIndex((currentIndex) => moveSelectionUp(rows(), currentIndex));
      return;
    }

    if (props.config.keybinds.match("move_down", evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedIndex((currentIndex) => moveSelectionDown(rows(), currentIndex));
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
}
