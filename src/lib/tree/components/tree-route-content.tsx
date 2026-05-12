/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { Show } from "solid-js";
import { TreeView } from "./tree-view";
import type { TreeFlatRow } from "../flatten";
import type { TreeThemePalette } from "../theme";

export type TreeRouteStatusTone = "notice" | "loading" | "error" | "empty";

export type TreeRouteBodyState =
  | {
      readonly kind: "status";
      readonly tone: TreeRouteStatusTone;
      readonly message: string;
    }
  | {
      readonly kind: "ready";
      readonly rows: readonly TreeFlatRow[];
    };

export type ResolveTreeRouteBodyStateInput = {
  readonly projectRoot?: string;
  readonly bootstrapLoading: boolean;
  readonly bootstrapErrorMessage?: string;
  readonly missingSessionContext: boolean;
  readonly projectedLoading: boolean;
  readonly projectedErrorMessage?: string;
  readonly rows: readonly TreeFlatRow[];
};

export type TreeRouteHelpPanelProps = {
  readonly palette: TreeThemePalette;
  readonly busy: boolean;
  readonly moveUpKeybind: string;
  readonly moveDownKeybind: string;
  readonly collapseKeybind: string;
  readonly expandKeybind: string;
  readonly selectKeybind: string;
  readonly backKeybind: string;
};

export type TreeRouteStatusPanelProps = {
  readonly palette: TreeThemePalette;
  readonly tone: TreeRouteStatusTone;
  readonly message: string;
};

export type TreeRouteBodyProps = {
  readonly state: TreeRouteBodyState;
  readonly palette: TreeThemePalette;
  readonly theme: () => TuiThemeCurrent;
  readonly selectedIndex: number | undefined;
  readonly treeWidth: number;
  readonly onFocusChange: (focused: boolean) => void;
};

export function resolveTreeRouteBodyState(
  input: ResolveTreeRouteBodyStateInput,
): TreeRouteBodyState {
  if (!input.projectRoot) {
    return {
      kind: "status",
      tone: "notice",
      message: "Project root unavailable.",
    };
  }

  if (input.bootstrapLoading) {
    return {
      kind: "status",
      tone: "loading",
      message: "Loading tree ownership...",
    };
  }

  if (input.bootstrapErrorMessage) {
    return {
      kind: "status",
      tone: "error",
      message: `Bootstrap error: ${input.bootstrapErrorMessage}`,
    };
  }

  if (input.missingSessionContext) {
    return {
      kind: "status",
      tone: "notice",
      message: "Open /tree from session route.",
    };
  }

  if (input.projectedLoading) {
    return {
      kind: "status",
      tone: "loading",
      message: "Loading session messages...",
    };
  }

  if (input.projectedErrorMessage) {
    return {
      kind: "status",
      tone: "error",
      message: `Projection error: ${input.projectedErrorMessage}`,
    };
  }

  if (input.rows.length === 0) {
    return {
      kind: "status",
      tone: "empty",
      message: "Tree empty.",
    };
  }

  return {
    kind: "ready",
    rows: input.rows,
  };
}

export function TreeRouteHelpPanel(props: TreeRouteHelpPanelProps) {
  const moveUpKeybind = formatTreeHelpKeybind(props.moveUpKeybind);
  const moveDownKeybind = formatTreeHelpKeybind(props.moveDownKeybind);
  const collapseKeybind = formatTreeHelpKeybind(props.collapseKeybind);
  const expandKeybind = formatTreeHelpKeybind(props.expandKeybind);
  const selectKeybind = formatTreeHelpKeybind(props.selectKeybind);
  const backKeybind = formatTreeHelpKeybind(props.backKeybind);

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={2}
      backgroundColor={props.palette.panelBackground}
    >
      <text fg={props.busy ? props.palette.branchingText : props.palette.helpText}>
        <span style={{ fg: props.palette.helpKey }}>
          {moveUpKeybind}/{moveDownKeybind}
        </span>{" "}
        move • <span style={{ fg: props.palette.helpKey }}>{collapseKeybind}/{expandKeybind}</span> collapse •{" "}
        <span style={{ fg: props.palette.helpKey }}>{selectKeybind}</span> branch •{" "}
        <span style={{ fg: props.palette.helpKey }}>{backKeybind}</span> back
      </text>
    </box>
  );
}

function formatTreeHelpKeybind(value: string): string {
  switch (value) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "return":
      return "Enter";
    case "escape":
      return "esc";
    case "left":
      return "←";
    case "right":
      return "→";
    default:
      return value;
  }
}

export function TreeRouteStatusPanel(props: TreeRouteStatusPanelProps) {
  const foreground = () => {
    switch (props.tone) {
      case "loading":
        return props.palette.loadingText;
      case "error":
        return props.palette.errorText;
      case "empty":
        return props.palette.emptyText;
      case "notice":
        return props.palette.noticeText;
    }
  };

  return (
    <box
      backgroundColor={props.palette.panelBackground}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={1}
    >
      <text fg={foreground()}>{props.message}</text>
    </box>
  );
}

export function TreeRouteBody(props: TreeRouteBodyProps) {
  return (
    <Show when={props.state} keyed>
      {(state: TreeRouteBodyState) =>
        state.kind === "status" ? (
          <TreeRouteStatusPanel palette={props.palette} tone={state.tone} message={state.message} />
        ) : (
          <box
            flexDirection="column"
            flexGrow={1}
            minHeight={0}
            backgroundColor={props.palette.panelBackground}
          >
            <TreeView
              rows={state.rows}
              selectedIndex={props.selectedIndex}
              width={props.treeWidth}
              theme={props.theme}
              autoFocus
              onFocusChange={props.onFocusChange}
            />
          </box>
        )
      }
    </Show>
  );
}
