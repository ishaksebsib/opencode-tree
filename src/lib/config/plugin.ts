import { z } from "zod";

export const treeStorageScopeSchema = z.enum(["global", "local"]);

const keybindValueSchema = z.union([
  z.string(),
  z.literal(false),
  z.literal("none"),
  z.array(z.string()),
]);

const treePluginKeybindsSchema = z
  .object({
    move_up: keybindValueSchema.optional(),
    move_down: keybindValueSchema.optional(),
    jump_up: keybindValueSchema.optional(),
    jump_down: keybindValueSchema.optional(),
    collapse: keybindValueSchema.optional(),
    expand: keybindValueSchema.optional(),
    select: keybindValueSchema.optional(),
    back: keybindValueSchema.optional(),
  })
  .strict();

export type TreeStorageScope = z.infer<typeof treeStorageScopeSchema>;
export type TreePluginKeybindValue = z.infer<typeof keybindValueSchema>;
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
