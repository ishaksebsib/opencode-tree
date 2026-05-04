import { z } from "zod";

export const treeStorageScopeSchema = z.enum(["global", "local"]);
const treePluginKeybindsSchema = z
  .object({
    move_up: z.string().optional(),
    move_down: z.string().optional(),
    jump_up: z.string().optional(),
    jump_down: z.string().optional(),
    select: z.string().optional(),
    back: z.string().optional(),
  })
  .strict();

export type TreeStorageScope = z.infer<typeof treeStorageScopeSchema>;
export type TreePluginKeybindOverrides = z.infer<typeof treePluginKeybindsSchema>;

const treePluginOptionsSchema = z
  .object({
    storageScope: treeStorageScopeSchema.default("global"),
    lines_per_jump: z.number().int().min(1).default(20),
    keybinds: treePluginKeybindsSchema.default({}),
  })
  .passthrough();

export type TreePluginOptions = {
  readonly storageScope: TreeStorageScope;
  readonly lines_per_jump: number;
  readonly keybinds: TreePluginKeybindOverrides;
};

export function parseTreePluginOptions(options: unknown): TreePluginOptions {
  const parsed = treePluginOptionsSchema.parse(options ?? {});
  return {
    storageScope: parsed.storageScope,
    lines_per_jump: parsed.lines_per_jump,
    keybinds: parsed.keybinds,
  };
}
