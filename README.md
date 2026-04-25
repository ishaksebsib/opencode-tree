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

Default install config uses global path to store tree state.

```json
{
  "plugin": [
    ["@ishaksebsib/opencode-tree", { "storageScope": "global" }]
  ]
}
```

To keep plugin data in the project root .opencode folder, use `local` storage scope:

```json
{
  "plugin": [
    ["@ishaksebsib/opencode-tree", { "storageScope": "local" }]
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
