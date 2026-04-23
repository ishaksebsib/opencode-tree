/** @jsxImportSource @opentui/solid */

import type { TextareaRenderable } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { useKeyboard } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Spinner } from "../../components/spinner"
import {
  createTreeBranchSummaryRequest,
  type TreeBranchSummaryOption,
  type TreeBranchSummaryRequest,
} from "../summary-option"

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
  title: string
  value: TreeBranchSummaryOption
  description: string
}>

export type TreeBranchSummaryDialogUI = Pick<TuiPluginApi["ui"], "dialog">

export type TreeBranchSummaryDialogProps = {
  readonly ui: TreeBranchSummaryDialogUI
  readonly theme: TuiThemeCurrent
  readonly onClose: () => void
  readonly onCancelBusy: () => void
  readonly onSelect: (request: TreeBranchSummaryRequest) => Promise<void> | void
}

type TreeBranchSummaryDialogMode = "select" | "custom-prompt"

export function TreeBranchSummaryDialog(props: TreeBranchSummaryDialogProps) {
  const [mode, setMode] = createSignal<TreeBranchSummaryDialogMode>("select")
  const [busy, setBusy] = createSignal(false)
  const [cancelRequested, setCancelRequested] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [customInstructions, setCustomInstructions] = createSignal("")
  const selectedOption = createMemo(() => branchSummaryDialogOptions[selectedIndex()] ?? branchSummaryDialogOptions[0])

  let disposed = false
  let textarea: TextareaRenderable | undefined

  onMount(() => {
    props.ui.dialog.setSize("medium")
  })

  onCleanup(() => {
    disposed = true
  })

  createEffect(() => {
    const currentMode = mode()
    const isBusy = busy()
    const currentTextarea = textarea
    if (!currentTextarea || currentTextarea.isDestroyed) return

    if (currentMode !== "custom-prompt" || isBusy) {
      currentTextarea.traits = isBusy
        ? {
            suspend: true,
            status: "BUSY",
          }
        : {}
      currentTextarea.blur()
      return
    }

    currentTextarea.traits = {
      status: "SUMMARY",
    }

    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      textarea.focus()
      textarea.gotoLineEnd()
    }, 1)
  })

  useKeyboard((evt) => {
    if (busy()) {
      if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
        evt.preventDefault()
        evt.stopPropagation()
        setCancelRequested(true)
        props.onCancelBusy()
        return
      }

      evt.preventDefault()
      evt.stopPropagation()
      return
    }

    if (mode() === "custom-prompt") {
      if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
        evt.preventDefault()
        evt.stopPropagation()
        setMode("select")
      }

      return
    }

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((current) => (current <= 0 ? branchSummaryDialogOptions.length - 1 : current - 1))
      return
    }

    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((current) => (current + 1) % branchSummaryDialogOptions.length)
      return
    }

    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      void selectOption(selectedOption().value)
      return
    }

    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      evt.preventDefault()
      evt.stopPropagation()
      props.onClose()
    }
  })

  const selectOption = async (option: TreeBranchSummaryOption) => {
    if (busy()) return

    if (option === "summarize-with-custom-prompt") {
      setMode("custom-prompt")
      return
    }

    if (option === "no-summary") {
      props.onSelect(createTreeBranchSummaryRequest(option))
      return
    }

    await submitRequest({ kind: "summarize" })
  }

  const submitCustomPrompt = async () => {
    if (busy()) return

    await submitRequest({
      kind: "summarize-with-custom-prompt",
      customPrompt: customInstructions().trim(),
    })
  }

  const submitRequest = async (request: Exclude<TreeBranchSummaryRequest, { kind: "no-summary" }>) => {
    setCancelRequested(false)
    setBusy(true)

    try {
      await waitForDialogRender()
      if (cancelRequested()) {
        props.onClose()
        return
      }

      await props.onSelect(request)
    } finally {
      if (!disposed) {
        setBusy(false)
      }
    }
  }

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={props.theme.text}>
          Create Branch
        </text>
        <text fg={props.theme.text}>
          esc <span style={{ fg: props.theme.textMuted }}>cancel</span>
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
                  textarea = value
                }}
                height={3}
                initialValue={customInstructions()}
                placeholder="Add extra summary instructions..."
                placeholderColor={props.theme.textMuted}
                textColor={props.theme.text}
                focusedTextColor={props.theme.text}
                cursorColor={props.theme.text}
                keyBindings={[{ name: "return", action: "submit" }]}
                onContentChange={() => {
                  setCustomInstructions(textarea?.plainText ?? "")
                }}
                onSubmit={() => {
                  void submitCustomPrompt()
                }}
              />
            </box>
          }
        >
          <box flexDirection="column">
            <For each={branchSummaryDialogOptions}>
              {(option, index) => {
                const selected = () => selectedIndex() === index()

                return (
                  <box
                    flexDirection="column"
                    paddingLeft={1}
                    paddingRight={1}
                    paddingTop={0}
                    paddingBottom={1}
                    backgroundColor={selected() ? props.theme.backgroundElement : undefined}
                  >
                    <text fg={selected() ? props.theme.primary : props.theme.text}>{option.title}</text>
                    <text fg={props.theme.textMuted}>{option.description}</text>
                  </box>
                )
              }}
            </For>
          </box>
        </Show>
      </Show>

      <Show when={!busy()}>
        <box paddingTop={1} flexDirection="row" gap={2}>
          <Show when={mode() === "select"}>
            <text fg={props.theme.text}>
              enter <span style={{ fg: props.theme.textMuted }}>select</span>
            </text>
            <text fg={props.theme.text}>
              j/k <span style={{ fg: props.theme.textMuted }}>move</span>
            </text>
          </Show>
          <Show when={mode() === "custom-prompt"}>
            <text fg={props.theme.text}>
              enter <span style={{ fg: props.theme.textMuted }}>submit</span>
            </text>
          </Show>
        </box>
      </Show>
    </box>
  )
}

function waitForDialogRender(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 1)
  })
}
