/** @jsxImportSource @opentui/solid */

import type { TextareaRenderable } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Spinner } from "../../components/spinner";
import { getTreeKeybindBindings, type TreeKeybindName, type TreeKeybinds } from "../keybinds";
import type { TreeBranchSummaryRequest } from "../route-branching";

type TreeBranchSummaryDialogOption = "no-summary" | "summarize" | "summarize-with-custom-prompt";

const branchSummaryDialogOptions = [
  {
    title: "No summary",
    value: "no-summary",
    description: "Create a new branch without a summary.",
  },
  {
    title: "Summarize",
    value: "summarize",
    description: "Summarize from this point, then create a new branch.",
  },
  {
    title: "Summarize with custom prompt",
    value: "summarize-with-custom-prompt",
    description: "Add custom instructions for summarization.",
  },
] as const satisfies ReadonlyArray<{
  title: string;
  value: TreeBranchSummaryDialogOption;
  description: string;
}>;

const branchSummaryDialogCommands = {
  move_up: "tree.summary.move_up",
  move_down: "tree.summary.move_down",
  select: "tree.summary.select",
  back: "tree.summary.back",
} as const;

export type TreeBranchSummaryDialogUI = Pick<TuiPluginApi["ui"], "dialog">;

export type TreeBranchSummaryDialogProps = {
  readonly keybinds: TreeKeybinds;
  readonly keybindLabel: (name: TreeKeybindName) => string;
  readonly keymap: TuiPluginApi["keymap"];
  readonly ui: TreeBranchSummaryDialogUI;
  readonly theme: TuiThemeCurrent;
  readonly onClose: () => void;
  readonly onCancelBusy: () => void;
  readonly onSelect: (request: TreeBranchSummaryRequest) => Promise<void> | void;
};

type TreeBranchSummaryDialogMode = "select" | "custom-prompt";

export function TreeBranchSummaryDialog(props: TreeBranchSummaryDialogProps) {
  const [mode, setMode] = createSignal<TreeBranchSummaryDialogMode>("select");
  const [busy, setBusy] = createSignal(false);
  const [cancelRequested, setCancelRequested] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [customInstructions, setCustomInstructions] = createSignal("");
  const selectedOption = createMemo(
    () => branchSummaryDialogOptions[selectedIndex()] ?? branchSummaryDialogOptions[0],
  );

  let disposed = false;
  let textarea: TextareaRenderable | undefined;

  onMount(() => {
    props.ui.dialog.setSize("medium");
  });

  onCleanup(() => {
    disposed = true;
  });

  createEffect(() => {
    const currentMode = mode();
    const isBusy = busy();
    const currentTextarea = textarea;
    if (!currentTextarea || currentTextarea.isDestroyed) return;

    if (currentMode !== "custom-prompt" || isBusy) {
      currentTextarea.traits = isBusy
        ? {
            suspend: true,
            status: "BUSY",
          }
        : {};
      currentTextarea.blur();
      return;
    }

    currentTextarea.traits = {
      status: "SUMMARY",
    };

    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return;
      textarea.focus();
      textarea.gotoLineEnd();
    }, 1);
  });

  createEffect(() => {
    const off = props.keymap.registerLayer({
      priority: 100,
      commands: [
        {
          name: branchSummaryDialogCommands.move_up,
          hidden: true,
          enabled: () => !busy() && mode() === "select",
          run: moveSelectionUp,
        },
        {
          name: branchSummaryDialogCommands.move_down,
          hidden: true,
          enabled: () => !busy() && mode() === "select",
          run: moveSelectionDown,
        },
        {
          name: branchSummaryDialogCommands.select,
          hidden: true,
          enabled: () => !busy(),
          run: runSelectCommand,
        },
        {
          name: branchSummaryDialogCommands.back,
          hidden: true,
          run: runBackCommand,
        },
      ],
      bindings: [
        ...getTreeKeybindBindings(props.keybinds, "move_up", branchSummaryDialogCommands.move_up),
        ...getTreeKeybindBindings(
          props.keybinds,
          "move_down",
          branchSummaryDialogCommands.move_down,
        ),
        ...getTreeKeybindBindings(props.keybinds, "select", branchSummaryDialogCommands.select),
        ...getTreeKeybindBindings(props.keybinds, "back", branchSummaryDialogCommands.back),
      ],
    });

    onCleanup(off);
  });

  const selectOption = async (option: TreeBranchSummaryDialogOption) => {
    if (busy()) return;

    if (option === "summarize-with-custom-prompt") {
      setMode("custom-prompt");
      return;
    }

    if (option === "no-summary") {
      props.onSelect({ kind: "no-summary" });
      return;
    }

    await submitRequest({ kind: "summarize" });
  };

  const submitCustomPrompt = async () => {
    if (busy()) return;

    await submitRequest({
      kind: "summarize",
      customInstructions: normalizeCustomInstructions(customInstructions()),
    });
  };

  const submitRequest = async (
    request: Exclude<TreeBranchSummaryRequest, { kind: "no-summary" }>,
  ) => {
    setCancelRequested(false);
    setBusy(true);

    try {
      await waitForDialogRender();
      if (cancelRequested()) {
        props.onClose();
        return;
      }

      await props.onSelect(request);
    } finally {
      if (!disposed) {
        setBusy(false);
      }
    }
  };

  function moveSelectionUp(): void {
    setSelectedIndex((current) =>
      current <= 0 ? branchSummaryDialogOptions.length - 1 : current - 1,
    );
  }

  function moveSelectionDown(): void {
    setSelectedIndex((current) => (current + 1) % branchSummaryDialogOptions.length);
  }

  function runSelectCommand(): void {
    if (mode() === "custom-prompt") {
      void submitCustomPrompt();
      return;
    }

    void selectOption(selectedOption().value);
  }

  function runBackCommand(): void {
    if (busy()) {
      setCancelRequested(true);
      props.onCancelBusy();
      return;
    }

    if (mode() === "custom-prompt") {
      setMode("select");
      return;
    }

    props.onClose();
  }

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={props.theme.text}>
          Create Branch
        </text>
        <text fg={props.theme.text}>
          {props.keybindLabel("back")} <span style={{ fg: props.theme.textMuted }}>cancel</span>
        </text>
      </box>

      <Show
        when={!busy()}
        fallback={
          <box gap={1}>
            <Spinner color={props.theme.textMuted}>Generating branch summary...</Spinner>
          </box>
        }
      >
        <Show
          when={mode() === "select"}
          fallback={
            <box gap={1}>
              <textarea
                ref={(value: TextareaRenderable) => {
                  textarea = value;
                }}
                height={3}
                initialValue={customInstructions()}
                placeholder="Add extra summary instructions..."
                placeholderColor={props.theme.textMuted}
                textColor={props.theme.text}
                focusedTextColor={props.theme.text}
                cursorColor={props.theme.text}
                onContentChange={() => {
                  setCustomInstructions(textarea?.plainText ?? "");
                }}
              />
            </box>
          }
        >
          <box flexDirection="column">
            <For each={branchSummaryDialogOptions}>
              {(option, index) => {
                const selected = () => selectedIndex() === index();

                return (
                  <box
                    flexDirection="column"
                    paddingLeft={1}
                    paddingRight={1}
                    paddingTop={1}
                    paddingBottom={1}
                    backgroundColor={selected() ? props.theme.backgroundElement : undefined}
                  >
                    <text fg={selected() ? props.theme.primary : props.theme.text}>
                      {option.title}
                    </text>
                    <text fg={props.theme.textMuted}>{option.description}</text>
                  </box>
                );
              }}
            </For>
          </box>
        </Show>
      </Show>

      <Show when={!busy()}>
        <box paddingTop={1} flexDirection="row" gap={2}>
          <Show when={mode() === "select"}>
            <text fg={props.theme.text}>
              {props.keybindLabel("select")}{" "}
              <span style={{ fg: props.theme.textMuted }}>select</span>
            </text>
            <text fg={props.theme.text}>
              {props.keybindLabel("move_up")}/{props.keybindLabel("move_down")}{" "}
              <span style={{ fg: props.theme.textMuted }}>move</span>
            </text>
          </Show>
          <Show when={mode() === "custom-prompt"}>
            <text fg={props.theme.text}>
              {props.keybindLabel("select")}{" "}
              <span style={{ fg: props.theme.textMuted }}>submit</span>
            </text>
            <text fg={props.theme.text}>
              {props.keybindLabel("back")} <span style={{ fg: props.theme.textMuted }}>back</span>
            </text>
          </Show>
        </box>
      </Show>
    </box>
  );
}

function waitForDialogRender(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 1);
  });
}

function normalizeCustomInstructions(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
