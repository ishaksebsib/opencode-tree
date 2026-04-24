import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readRegistry, registerSessionTree, writeRegistry } from "../../src/lib/storage/registry";
import { StorageJsonParseError, StorageSchemaError } from "../../src/lib/storage/file";
import { getRegistryFilePath } from "../../src/lib/storage/paths";

let storageRoot = "";

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), "opencode-tree-registry-"));
});

afterEach(async () => {
  if (storageRoot) {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

describe("readRegistry", () => {
  test("returns empty default when registry file is missing", async () => {
    expect(readRegistry(storageRoot)).resolves.toEqual({
      version: 1,
      sessions: {},
    });
  });

  test("fails clearly for invalid json", async () => {
    const filePath = getRegistryFilePath(storageRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, "not json", "utf8");

    expect(readRegistry(storageRoot)).rejects.toBeInstanceOf(StorageJsonParseError);
  });

  test("fails clearly for invalid schema", async () => {
    const filePath = getRegistryFilePath(storageRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ version: 2, sessions: {} }), "utf8");

    expect(readRegistry(storageRoot)).rejects.toBeInstanceOf(StorageSchemaError);
  });
});

describe("registerSessionTree", () => {
  test("adds new session mapping without mutating existing entries", () => {
    expect(
      registerSessionTree(
        {
          version: 1,
          sessions: {
            sess_root: "tree_01",
          },
        },
        "sess_child",
        "tree_01",
      ),
    ).toEqual({
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    });
  });

  test("returns original registry for duplicate same-tree mapping", () => {
    const registry = {
      version: 1,
      sessions: {
        sess_root: "tree_01",
      },
    } as const;

    expect(registerSessionTree(registry, "sess_root", "tree_01")).toBe(registry);
  });

  test("throws for conflicting tree mapping", () => {
    expect(() =>
      registerSessionTree(
        {
          version: 1,
          sessions: {
            sess_root: "tree_01",
          },
        },
        "sess_root",
        "tree_02",
      ),
    ).toThrow("Session sess_root is already registered to tree tree_01");
  });
});

describe("writeRegistry", () => {
  test("creates parent dirs and round-trips valid data", async () => {
    const written = await writeRegistry(storageRoot, {
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    });

    expect(written).toEqual({
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    });

    expect(readRegistry(storageRoot)).resolves.toEqual(written);

    const filePath = getRegistryFilePath(storageRoot);
    const content = await readFile(filePath, "utf8");
    expect(content.endsWith("\n")).toBe(true);
  });

  test("rejects invalid registry before write", async () => {
    const invalidRegistry = JSON.parse('{"version":2,"sessions":{}}');

    expect(writeRegistry(storageRoot, invalidRegistry)).rejects.toBeInstanceOf(StorageSchemaError);
  });
});
