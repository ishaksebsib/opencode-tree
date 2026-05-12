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

`~/.config/opencode/tui.json`

By default, tree state is saved [globally](#global-storage).

To save it in the current project’s `.opencode` folder instead, set `storageScope` to `local`:

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
- <a id="global-storage"></a>if `global`: `<opencode-state>/plugins/opencode-tree/`
  - Where `<opencode-state>` is:
    - Linux: `~/.local/state/opencode`
    - macOS: `~/Library/Application Support/opencode`
    - Windows: `%LOCALAPPDATA%\\opencode`
