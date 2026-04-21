import { describe, expect, test } from "bun:test"
import { ZodError } from "zod"
import { parseTreePluginOptions } from "../../src/lib/config/plugin"

describe("parseTreePluginOptions", () => {
  test("defaults storageScope to global", () => {
    expect(parseTreePluginOptions(undefined)).toEqual({
      storageScope: "global",
    })
  })

  test("accepts local storageScope", () => {
    expect(
      parseTreePluginOptions({
        storageScope: "local",
      }),
    ).toEqual({
      storageScope: "local",
    })
  })

  test("rejects invalid storageScope", () => {
    expect(() =>
      parseTreePluginOptions({
        storageScope: "workspace",
      }),
    ).toThrow(ZodError)
  })
})
