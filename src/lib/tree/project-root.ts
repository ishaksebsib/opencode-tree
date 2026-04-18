import type { TuiState } from "@opencode-ai/plugin/tui"

export type OpenCodePathState = Pick<TuiState["path"], "worktree" | "directory">

export function resolveProjectRoot(path: OpenCodePathState): string | undefined {
  const worktree = path.worktree.trim()
  if (worktree) return worktree

  const directory = path.directory.trim()
  return directory || undefined
}
