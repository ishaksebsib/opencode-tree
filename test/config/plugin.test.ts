import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { parseTreePluginOptions } from "../../src/lib/config/plugin";

describe("parseTreePluginOptions", () => {
  test("defaults storageScope to global", () => {
    expect(parseTreePluginOptions(undefined)).toEqual({
      storageScope: "global",
      lines_per_jump: 20,
      keybinds: {},
    });
  });

  test("accepts local storageScope", () => {
    expect(
      parseTreePluginOptions({
        storageScope: "local",
        lines_per_jump: 12,
        keybinds: {
          move_up: "w",
          move_down: "s",
          jump_up: "shift+up",
          jump_down: "shift+down",
          select: "space",
          back: "q",
        },
      }),
    ).toEqual({
      storageScope: "local",
      lines_per_jump: 12,
      keybinds: {
        move_up: "w",
        move_down: "s",
        jump_up: "shift+up",
        jump_down: "shift+down",
        select: "space",
        back: "q",
      },
    });
  });

  test("defaults jump settings when omitted", () => {
    expect(
      parseTreePluginOptions({
        storageScope: "global",
      }),
    ).toEqual({
      storageScope: "global",
      lines_per_jump: 20,
      keybinds: {},
    });
  });

  test("rejects invalid storageScope", () => {
    expect(() =>
      parseTreePluginOptions({
        storageScope: "workspace",
      }),
    ).toThrow(ZodError);
  });

  test("rejects non-positive lines_per_jump", () => {
    expect(() =>
      parseTreePluginOptions({
        lines_per_jump: 0,
      }),
    ).toThrow(ZodError);
  });

  test("rejects unknown keybind overrides", () => {
    expect(() =>
      parseTreePluginOptions({
        keybinds: {
          jump_left: "shift+left",
        },
      }),
    ).toThrow(ZodError);
  });
});
