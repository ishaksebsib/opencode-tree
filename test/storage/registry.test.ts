import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readRegistry, writeRegistry } from "../../src/lib/storage/registry"
import { StorageJsonParseError, StorageSchemaError } from "../../src/lib/storage/file"
import { getRegistryFilePath } from "../../src/lib/storage/paths"

let projectRoot = ""

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "opencode-tree-registry-"))
})

afterEach(async () => {
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

describe("readRegistry", () => {
  test("returns empty default when registry file is missing", async () => {
    expect(readRegistry(projectRoot)).resolves.toEqual({
      version: 1,
      sessions: {},
    })
  })

  test("fails clearly for invalid json", async () => {
    const filePath = getRegistryFilePath(projectRoot)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, "not json", "utf8")

    expect(readRegistry(projectRoot)).rejects.toBeInstanceOf(StorageJsonParseError)
  })

  test("fails clearly for invalid schema", async () => {
    const filePath = getRegistryFilePath(projectRoot)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify({ version: 2, sessions: {} }), "utf8")

    expect(readRegistry(projectRoot)).rejects.toBeInstanceOf(StorageSchemaError)
  })
})

describe("writeRegistry", () => {
  test("creates parent dirs and round-trips valid data", async () => {
    const written = await writeRegistry(projectRoot, {
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    })

    expect(written).toEqual({
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    })

    expect(readRegistry(projectRoot)).resolves.toEqual(written)

    const filePath = getRegistryFilePath(projectRoot)
    const content = await readFile(filePath, "utf8")
    expect(content.endsWith("\n")).toBe(true)
  })

  test("rejects invalid registry before write", async () => {
    const invalidRegistry = JSON.parse('{"version":2,"sessions":{}}')

    expect(writeRegistry(projectRoot, invalidRegistry)).rejects.toBeInstanceOf(StorageSchemaError)
  })
})
