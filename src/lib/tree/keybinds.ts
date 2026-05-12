import type { TuiKeybindMap, TuiKeybindSet } from "@opencode-ai/plugin/tui";

export const treeKeybindDefaults = {
  move_up: "up,k",
  move_down: "down,j",
  jump_up: "shift+up,shift+k",
  jump_down: "shift+down,shift+j",
  collapse: "left,h",
  expand: "right,l",
  select: "return",
  back: "escape,ctrl+c",
} satisfies TuiKeybindMap;

export type TreeKeybindName = keyof typeof treeKeybindDefaults;

export type TreeKeybinds = Pick<TuiKeybindSet, "get" | "match" | "print">;
