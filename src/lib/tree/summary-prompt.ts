export const TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`

export const TREE_BRANCH_SUMMARY_INSTRUCTIONS = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`

export const TREE_BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`

export type BuildTreeBranchSummaryPromptInput = {
  readonly conversation: string
  readonly customInstructions?: string
}

export function buildTreeBranchSummaryInstructions(customInstructions?: string): string {
  const normalizedCustomInstructions = customInstructions?.trim()
  if (!normalizedCustomInstructions) {
    return TREE_BRANCH_SUMMARY_INSTRUCTIONS
  }

  return `${TREE_BRANCH_SUMMARY_INSTRUCTIONS}\n\nAdditional focus: ${normalizedCustomInstructions}`
}

export function buildTreeBranchSummaryPrompt(input: BuildTreeBranchSummaryPromptInput): string {
  return `<conversation>\n${input.conversation}\n</conversation>\n\n${buildTreeBranchSummaryInstructions(input.customInstructions)}`
}

export function buildTreeBranchSummaryMessage(summary: string): string {
  const normalizedSummary = summary.trim()
  return `${TREE_BRANCH_SUMMARY_PREAMBLE}${normalizedSummary}`
}
