import { describe, expect, test } from "bun:test"
import { resolveProjectRoot } from "../../src/lib/tree/project-root"

describe("resolveProjectRoot", () => {
  test("prefers worktree when present", () => {
    expect(
      resolveProjectRoot({
        worktree: "/repo/root",
        directory: "/repo/root/packages/plugin",
      }),
    ).toBe("/repo/root")
  })

  test("falls back to directory", () => {
    expect(
      resolveProjectRoot({
        worktree: "",
        directory: "/repo/root",
      }),
    ).toBe("/repo/root")
  })

  test("returns undefined when no path is available", () => {
    expect(
      resolveProjectRoot({
        worktree: "",
        directory: "",
      }),
    ).toBeUndefined()
  })
})
