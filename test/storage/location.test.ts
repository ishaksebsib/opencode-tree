import { describe, expect, test } from "bun:test"
import { createProjectStorageKey, resolveStorageRoot } from "../../src/lib/storage"

describe("createProjectStorageKey", () => {
  test("slugifies basename and appends a stable hash", () => {
    const key = createProjectStorageKey("/tmp/My Project")

    expect(key).toMatch(/^my-project-[0-9a-f]{12}$/)
    expect(createProjectStorageKey("/tmp/My Project")).toBe(key)
  })

  test("uses different keys for different project roots", () => {
    expect(createProjectStorageKey("/tmp/repo-a")).not.toBe(createProjectStorageKey("/tmp/repo-b"))
  })
})

describe("resolveStorageRoot", () => {
  test("keeps local scope under project .opencode", () => {
    expect(
      resolveStorageRoot({
        projectRoot: "/repo/root",
        stateRoot: "/state/opencode",
        storageScope: "local",
      }),
    ).toBe("/repo/root/.opencode/opencode-tree")
  })

  test("uses per-project global state directory for global scope", () => {
    const projectRoot = "/repo/root"

    expect(
      resolveStorageRoot({
        projectRoot,
        stateRoot: "/state/opencode",
        storageScope: "global",
      }),
    ).toBe(`/state/opencode/plugins/opencode-tree/projects/${createProjectStorageKey(projectRoot)}`)
  })

  test("fails clearly when global state root is missing", () => {
    expect(() =>
      resolveStorageRoot({
        projectRoot: "/repo/root",
        stateRoot: "",
        storageScope: "global",
      }),
    ).toThrow("Missing stateRoot")
  })
})
