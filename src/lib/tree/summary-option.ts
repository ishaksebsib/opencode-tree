export type TreeBranchSummaryOption = "no-summary" | "summarize" | "summarize-with-custom-prompt"

export type TreeBranchSummaryRequest =
  | {
      readonly kind: "no-summary"
    }
  | {
      readonly kind: "summarize"
    }
  | {
      readonly kind: "summarize-with-custom-prompt"
      readonly customPrompt: string
    }

export function createTreeBranchSummaryRequest(
  option: TreeBranchSummaryOption,
  customPrompt = "",
): TreeBranchSummaryRequest {
  if (option === "no-summary") {
    return {
      kind: "no-summary",
    }
  }

  if (option === "summarize") {
    return {
      kind: "summarize",
    }
  }

  return {
    kind: "summarize-with-custom-prompt",
    customPrompt,
  }
}

export function getTreeBranchSummaryCustomInstructions(
  request: TreeBranchSummaryRequest,
): string | undefined {
  if (request.kind !== "summarize-with-custom-prompt") {
    return undefined
  }

  const normalized = request.customPrompt.trim()
  return normalized.length > 0 ? normalized : undefined
}
