# opencode-tree

Pi-style `/tree` plugin for the OpenCode TUI.

## Install

Install globally:

```bash
opencode plugin @ishaksebsib/opencode-tree --global
```

Install locally:

```bash
opencode plugin @ishaksebsib/opencode-tree
```

## Config

Default install config uses global path to store tree state.

```json
{
  "plugin": [["@ishaksebsib/opencode-tree", { "storageScope": "global" }]]
}
```

To keep plugin data in the project root .opencode folder, use `local` storage scope:

```json
{
  "plugin": [["@ishaksebsib/opencode-tree", { "storageScope": "local" }]]
}
```

## Storage

- if `local`: `<projectRoot>/.opencode/opencode-tree/`
- if `global`: `<opencode-state>/plugins/opencode-tree/`
  - Where `<opencode-state>` is:
    - Linux: `~/.local/state/opencode`
    - macOS: `~/Library/Application Support/opencode`
    - Windows: `%LOCALAPPDATA%\\opencode`
