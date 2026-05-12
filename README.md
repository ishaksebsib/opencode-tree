### PI-style `/tree` plugin for the OpenCode TUI.

`opencode-tree` adds a tree view for branched conversations without modifying OpenCode core. OpenCode remains the source of truth, while the plugin stores only the branch data needed for navigation and rendering

## [Demo](https://github.com/ishaksebsib/opencode-tree/blob/main/demo.gif)

![opencode-tree demo](./demo.gif)

## Installation

Install globally:

```bash
opencode plugin @ishaksebsib/opencode-tree --global
```

Install in the current project:

```bash
opencode plugin @ishaksebsib/opencode-tree
```

## Configuration

Config file: `~/.config/opencode/tui.json`

By default, the plugin stores tree state in OpenCode's global state directory.

```json
{
  "plugin": [["@ishaksebsib/opencode-tree", { "storageScope": "global" }]]
}
```

To store plugin data inside the project's `.opencode` folder, set `storageScope` to `local`:

```json
{
  "plugin": [["@ishaksebsib/opencode-tree", { "storageScope": "local" }]]
}
```

### Full Configuration

All options are optional. This example shows the default values:

```json
{
  "plugin": [
    [
      "@ishaksebsib/opencode-tree",
      {
        "storageScope": "global",
        "lines_per_jump": 20,
        "keybinds": {
          "move_up": "up,k",
          "move_down": "down,j",
          "jump_up": "shift+up,shift+k",
          "jump_down": "shift+down,shift+j",
          "collapse": "left,h",
          "expand": "right,l",
          "select": "return",
          "back": "escape,ctrl+c"
        }
      }
    ]
  ]
}
```

## Storage

- if `local`: `<projectRoot>/.opencode/opencode-tree/`
- if `global`: `<opencode-state>/plugins/opencode-tree/`
  - Where `<opencode-state>` is:
    - Linux: `~/.local/state/opencode`
    - macOS: `~/Library/Application Support/opencode`
    - Windows: `%LOCALAPPDATA%\\opencode`
