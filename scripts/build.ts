#!/usr/bin/env bun

import { rm } from "node:fs/promises"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

await rm("dist", { recursive: true, force: true })

const build = await Bun.build({
  entrypoints: ["./src/tui.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: false,
  external: [
    "@opencode-ai/plugin",
    "@opencode-ai/plugin/*",
    "@opentui/core",
    "@opentui/core/*",
    "@opentui/solid",
    "@opentui/solid/*",
    "solid-js",
    "solid-js/*",
  ],
  plugins: [createSolidTransformPlugin()],
})

if (!build.success) {
  for (const log of build.logs) {
    console.error(log)
  }
  process.exit(1)
}

await Bun.$`bun x tsc -p tsconfig.build.json`
