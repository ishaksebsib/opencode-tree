import {
  createBindingLookup,
  type Binding,
  type BindingConfig,
  type BindingValue,
  type KeyEvent,
  type Renderable,
  type TuiKeymap,
} from "@opencode-ai/plugin/tui";
import type { TreePluginKeybindOverrides, TreePluginKeybindValue } from "../config/plugin";

export const treeKeybindCommands = {
  move_up: "tree.move_up",
  move_down: "tree.move_down",
  jump_up: "tree.jump_up",
  jump_down: "tree.jump_down",
  collapse: "tree.collapse",
  expand: "tree.expand",
  select: "tree.select",
  back: "tree.back",
} as const;

export type TreeKeybindName = keyof typeof treeKeybindCommands;
export type TreeKeybindCommand = (typeof treeKeybindCommands)[TreeKeybindName];
export type TreeKeybinds = ReturnType<typeof createTreeKeybinds>;

export const treeRouteCommands = Object.values(treeKeybindCommands) as TreeKeybindCommand[];

const treeKeybindDefaults = {
  [treeKeybindCommands.move_up]: ["up", "k"],
  [treeKeybindCommands.move_down]: ["down", "j"],
  [treeKeybindCommands.jump_up]: ["shift+up", "shift+k"],
  [treeKeybindCommands.jump_down]: ["shift+down", "shift+j"],
  [treeKeybindCommands.collapse]: ["left", "h"],
  [treeKeybindCommands.expand]: ["right", "l"],
  [treeKeybindCommands.select]: "return",
  [treeKeybindCommands.back]: ["escape", "ctrl+c"],
} satisfies BindingConfig<Renderable, KeyEvent>;

export function createTreeKeybinds(overrides: TreePluginKeybindOverrides) {
  return createBindingLookup(createTreeBindingConfig(overrides));
}

export function getTreeKeybindBindings(
  keybinds: TreeKeybinds,
  name: TreeKeybindName,
  command: string = treeKeybindCommands[name],
): Binding<Renderable, KeyEvent>[] {
  return keybinds.get(treeKeybindCommands[name]).map((binding) => ({ ...binding, cmd: command }));
}

export function formatTreeKeybindLabel(
  keymap: TuiKeymap,
  keybinds: TreeKeybinds,
  name: TreeKeybindName,
): string {
  const key = keybinds.get(treeKeybindCommands[name])[0]?.key;
  if (!key) return "";

  const formatted = keymap.formatKey(key);
  switch (formatted.toLowerCase()) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "left":
      return "←";
    case "right":
      return "→";
    case "return":
      return "enter";
    case "escape":
      return "esc";
    default:
      return formatted;
  }
}

function createTreeBindingConfig(
  overrides: TreePluginKeybindOverrides,
): BindingConfig<Renderable, KeyEvent> {
  const config: Record<string, BindingValue<Renderable, KeyEvent>> = { ...treeKeybindDefaults };

  for (const [name, value] of Object.entries(overrides) as [
    TreeKeybindName,
    TreePluginKeybindValue,
  ][]) {
    config[treeKeybindCommands[name]] = normalizeTreeKeybindValue(value);
  }

  return config;
}

function normalizeTreeKeybindValue(
  value: TreePluginKeybindValue,
): BindingValue<Renderable, KeyEvent> {
  if (typeof value !== "string") return value;

  const keys = value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  return keys.length <= 1 ? (keys[0] ?? "none") : keys;
}
