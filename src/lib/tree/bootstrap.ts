import { randomUUID } from "node:crypto";
import {
  createEmptyRegistry,
  readRegistry,
  readSnapshot,
  writeRegistry,
  writeSnapshot,
  type TreeRegistry,
  type TreeSnapshot,
} from "../storage";

export type TreeIdGenerator = () => string;

export type MissingSessionContextBootstrapResult = {
  readonly kind: "missing-session-context";
  readonly projectRoot: string;
  readonly storageRoot: string;
};

export type FoundTreeBootstrapResult = {
  readonly kind: "found-tree";
  readonly projectRoot: string;
  readonly storageRoot: string;
  readonly treeId: string;
  readonly currentSessionId: string;
  readonly snapshot: TreeSnapshot;
};

export type CreatedTreeBootstrapResult = {
  readonly kind: "created-tree";
  readonly projectRoot: string;
  readonly storageRoot: string;
  readonly treeId: string;
  readonly currentSessionId: string;
  readonly snapshot: TreeSnapshot;
};

export type TreeBootstrapResult =
  | MissingSessionContextBootstrapResult
  | FoundTreeBootstrapResult
  | CreatedTreeBootstrapResult;

export type TreeBootstrapInput = {
  readonly projectRoot: string;
  readonly storageRoot: string;
  readonly sessionID?: string;
};

export type TreeBootstrapStorage = {
  readRegistry(storageRoot: string): Promise<TreeRegistry>;
  writeRegistry(storageRoot: string, registry: TreeRegistry): Promise<TreeRegistry>;
  readSnapshot(storageRoot: string, treeId: string): Promise<TreeSnapshot>;
  writeSnapshot(storageRoot: string, snapshot: TreeSnapshot): Promise<TreeSnapshot>;
};

export type TreeBootstrapDependencies = {
  readonly storage: TreeBootstrapStorage;
  readonly createTreeId: TreeIdGenerator;
};

const defaultDependencies: TreeBootstrapDependencies = {
  storage: {
    readRegistry,
    writeRegistry,
    readSnapshot,
    writeSnapshot,
  },
  createTreeId,
};

export function createTreeId(generateUUID: TreeIdGenerator = randomUUID): string {
  return `tree_${generateUUID().replaceAll("-", "")}`;
}

export function createRootTreeSnapshot(treeId: string, sessionID: string): TreeSnapshot {
  return {
    version: 1,
    treeId,
    rootSessionId: sessionID,
    sessions: {
      [sessionID]: {
        sessionId: sessionID,
        parentSessionId: null,
        anchorMessageId: null,
        children: [],
      },
    },
  };
}

export async function bootstrapTree(
  input: TreeBootstrapInput,
  dependencies: TreeBootstrapDependencies = defaultDependencies,
): Promise<TreeBootstrapResult> {
  if (!input.sessionID) {
    return {
      kind: "missing-session-context",
      projectRoot: input.projectRoot,
      storageRoot: input.storageRoot,
    };
  }

  const registry = await dependencies.storage.readRegistry(input.storageRoot);
  const existingTreeId = registry.sessions[input.sessionID];

  if (existingTreeId) {
    const snapshot = await dependencies.storage.readSnapshot(input.storageRoot, existingTreeId);
    return {
      kind: "found-tree",
      projectRoot: input.projectRoot,
      storageRoot: input.storageRoot,
      treeId: existingTreeId,
      currentSessionId: input.sessionID,
      snapshot,
    };
  }

  const treeId = dependencies.createTreeId();
  const snapshot = createRootTreeSnapshot(treeId, input.sessionID);
  const nextRegistry: TreeRegistry = {
    ...createEmptyRegistry(),
    ...registry,
    sessions: {
      ...registry.sessions,
      [input.sessionID]: treeId,
    },
  };

  await dependencies.storage.writeSnapshot(input.storageRoot, snapshot);
  await dependencies.storage.writeRegistry(input.storageRoot, nextRegistry);

  return {
    kind: "created-tree",
    projectRoot: input.projectRoot,
    storageRoot: input.storageRoot,
    treeId,
    currentSessionId: input.sessionID,
    snapshot,
  };
}
