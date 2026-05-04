import type { TuiKeybindMap, TuiKeybindSet } from "@opencode-ai/plugin/tui";

export const treeRouteKeybindDefaults = {
  jump_up: "shift+up,shift+k",
  jump_down: "shift+down,shift+j",
} satisfies TuiKeybindMap;

export type TreeRouteKeybindName = keyof typeof treeRouteKeybindDefaults;

export type TreeRouteKeybinds = Pick<TuiKeybindSet, "get" | "match" | "print">;
