import { z } from "zod";

export const STORAGE_VERSION = 1 as const;

export const sessionIDSchema = z.string().min(1);
export const treeIDSchema = z.string().min(1);
export const messageIDSchema = z.string().min(1);

export const registrySchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    sessions: z.record(sessionIDSchema, treeIDSchema),
  })
  .strict();

export const snapshotSessionSchema = z
  .object({
    sessionId: sessionIDSchema,
    parentSessionId: sessionIDSchema.nullable(),
    anchorMessageId: messageIDSchema.nullable(),
    children: z.array(sessionIDSchema),
  })
  .strict();

export const snapshotSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    treeId: treeIDSchema,
    rootSessionId: sessionIDSchema,
    sessions: z.record(sessionIDSchema, snapshotSessionSchema),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const sessionEntries = Object.entries(snapshot.sessions);
    const childIdSetBySessionId = new Map<string, ReadonlySet<string>>();

    for (const [sessionKey, node] of sessionEntries) {
      const childIdSet = new Set(node.children);
      childIdSetBySessionId.set(sessionKey, childIdSet);

      if (childIdSet.size !== node.children.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "children must not contain duplicates",
          path: ["sessions", sessionKey, "children"],
        });
      }
    }

    const rootNode = snapshot.sessions[snapshot.rootSessionId];

    if (!rootNode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rootSessionId ${snapshot.rootSessionId} is missing from sessions`,
        path: ["rootSessionId"],
      });
      return;
    }

    if (rootNode.parentSessionId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "root session must have parentSessionId null",
        path: ["sessions", snapshot.rootSessionId, "parentSessionId"],
      });
    }

    if (rootNode.anchorMessageId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "root session must have anchorMessageId null",
        path: ["sessions", snapshot.rootSessionId, "anchorMessageId"],
      });
    }

    for (const [sessionKey, node] of sessionEntries) {
      if (node.sessionId !== sessionKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `session key ${sessionKey} must match sessionId ${node.sessionId}`,
          path: ["sessions", sessionKey, "sessionId"],
        });
      }

      if (node.parentSessionId === node.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "session cannot be its own parent",
          path: ["sessions", sessionKey, "parentSessionId"],
        });
      }

      if (sessionKey !== snapshot.rootSessionId && node.parentSessionId === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-root session must have parentSessionId",
          path: ["sessions", sessionKey, "parentSessionId"],
        });
      }

      if (sessionKey !== snapshot.rootSessionId && node.anchorMessageId === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-root session must have anchorMessageId",
          path: ["sessions", sessionKey, "anchorMessageId"],
        });
      }

      if (node.parentSessionId !== null) {
        const parentNode = snapshot.sessions[node.parentSessionId];
        const parentChildIdSet = childIdSetBySessionId.get(node.parentSessionId);

        if (!parentNode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `parent session ${node.parentSessionId} is missing`,
            path: ["sessions", sessionKey, "parentSessionId"],
          });
        } else if (!parentChildIdSet?.has(node.sessionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `parent session ${node.parentSessionId} must list ${node.sessionId} in children`,
            path: ["sessions", node.parentSessionId, "children"],
          });
        }
      }

      for (const [childIndex, childSessionId] of node.children.entries()) {
        const childNode = snapshot.sessions[childSessionId];

        if (!childNode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `child session ${childSessionId} is missing`,
            path: ["sessions", sessionKey, "children", childIndex],
          });
          continue;
        }

        if (childNode.parentSessionId !== node.sessionId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `child session ${childSessionId} must point back to parent ${node.sessionId}`,
            path: ["sessions", childSessionId, "parentSessionId"],
          });
        }
      }
    }
  });

export type TreeRegistry = z.infer<typeof registrySchema>;
export type TreeSnapshotSession = z.infer<typeof snapshotSessionSchema>;
export type TreeSnapshot = z.infer<typeof snapshotSchema>;

export function createEmptyRegistry(): TreeRegistry {
  return {
    version: STORAGE_VERSION,
    sessions: {},
  };
}
