import { describe, expect, test } from "bun:test"
import {
  TREE_BRANCH_SUMMARY_PREAMBLE,
  TREE_BRANCH_SUMMARY_INSTRUCTIONS,
  TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
  buildTreeBranchSummaryMessage,
  buildTreeBranchSummaryInstructions,
  buildTreeBranchSummaryPrompt,
} from "../../src/lib/opencode/summary"

describe("buildTreeBranchSummaryInstructions", () => {
  test("returns Pi-style default instructions by default", () => {
    expect(buildTreeBranchSummaryInstructions()).toBe(TREE_BRANCH_SUMMARY_INSTRUCTIONS)
  })

  test("appends trimmed custom instructions", () => {
    expect(buildTreeBranchSummaryInstructions("  focus on open files  ")).toBe(
      `${TREE_BRANCH_SUMMARY_INSTRUCTIONS}\n\nAdditional focus: focus on open files`,
    )
  })

  test("ignores empty custom instructions", () => {
    expect(buildTreeBranchSummaryInstructions("   ")).toBe(TREE_BRANCH_SUMMARY_INSTRUCTIONS)
  })
})

describe("buildTreeBranchSummaryPrompt", () => {
  test("wraps serialized conversation and instructions in Pi-style prompt format", () => {
    expect(
      buildTreeBranchSummaryPrompt({
        conversation: "[User]: fix bug\n\n[Assistant]: checking",
      }),
    ).toBe(
      `<conversation>\n[User]: fix bug\n\n[Assistant]: checking\n</conversation>\n\n${TREE_BRANCH_SUMMARY_INSTRUCTIONS}`,
    )
  })

  test("includes appended custom focus in prompt", () => {
    expect(
      buildTreeBranchSummaryPrompt({
        conversation: "[User]: fix bug",
        customInstructions: "emphasize blockers",
      }),
    ).toContain("Additional focus: emphasize blockers")
  })
})

describe("TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT", () => {
  test("states the model must summarize instead of continue the conversation", () => {
    expect(TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("Do NOT continue the conversation.")
    expect(TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT).toContain("ONLY output the structured summary.")
  })
})

describe("buildTreeBranchSummaryMessage", () => {
  test("prefixes the generated summary with the Pi-style branch preamble", () => {
    expect(buildTreeBranchSummaryMessage("  ## Goal\nShip it  ")).toBe(
      `${TREE_BRANCH_SUMMARY_PREAMBLE}## Goal\nShip it`,
    )
  })
})
