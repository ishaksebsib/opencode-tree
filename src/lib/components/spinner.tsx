/** @jsxImportSource @opentui/solid */

import type { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";
import "opentui-spinner/solid";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner(props: { readonly children?: JSX.Element; readonly color?: RGBA }) {
  return (
    <box flexDirection="row" gap={1}>
      <spinner frames={frames} interval={80} color={props.color} />
      <Show when={props.children}>
        <text fg={props.color}>{props.children}</text>
      </Show>
    </box>
  );
}
