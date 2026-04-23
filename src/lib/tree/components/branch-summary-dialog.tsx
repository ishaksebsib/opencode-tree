/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import {
  createTreeBranchSummaryRequest,
  type TreeBranchSummaryOption,
  type TreeBranchSummaryRequest,
} from "../summary-option"

const branchSummaryDialogOptions = [
  {
    title: "No summary",
    value: "no-summary",
  },
  {
    title: "Summarize",
    value: "summarize",
  },
  {
    title: "Summarize with custom prompt",
    value: "summarize-with-custom-prompt",
  },
] as const satisfies ReadonlyArray<{
  title: string
  value: TreeBranchSummaryOption
}>

export type TreeBranchSummaryDialogUI = Pick<TuiPluginApi["ui"], "DialogPrompt" | "DialogSelect">

export type TreeBranchSummaryDialogProps = {
  readonly ui: TreeBranchSummaryDialogUI
  readonly onSelect: (request: TreeBranchSummaryRequest) => void
  readonly onSelectCustomPrompt: () => void
}

export function TreeBranchSummaryDialog(props: TreeBranchSummaryDialogProps) {
  return props.ui.DialogSelect<TreeBranchSummaryOption>({
    title: "Branch summary",
    options: [...branchSummaryDialogOptions],
    onSelect: (option) => {
      if (option.value === "summarize-with-custom-prompt") {
        props.onSelectCustomPrompt()
        return
      }

      props.onSelect(createTreeBranchSummaryRequest(option.value))
    },
  })
}

export type TreeBranchSummaryPromptDialogProps = {
  readonly ui: Pick<TuiPluginApi["ui"], "DialogPrompt">
  readonly onConfirm: (request: TreeBranchSummaryRequest) => void
  readonly onCancel: () => void
}

export function TreeBranchSummaryPromptDialog(props: TreeBranchSummaryPromptDialogProps) {
  return props.ui.DialogPrompt({
    title: "Summary prompt",
    placeholder: "Add extra summary instructions...",
    onConfirm: (value) => {
      props.onConfirm(createTreeBranchSummaryRequest("summarize-with-custom-prompt", value.trim()))
    },
    onCancel: props.onCancel,
  })
}
