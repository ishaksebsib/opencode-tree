/** @jsxImportSource @opentui/solid */

import type { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, onCleanup, Show } from "solid-js";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner(props: { readonly children?: JSX.Element; readonly color?: RGBA }) {
  const [frameIndex, setFrameIndex] = createSignal(0);
  const interval = setInterval(() => {
    setFrameIndex((current) => (current + 1) % frames.length);
  }, 80);

  onCleanup(() => {
    clearInterval(interval);
  });

  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.color}>{frames[frameIndex()]}</text>
      <Show when={props.children}>
        <text fg={props.color}>{props.children}</text>
      </Show>
    </box>
  );
}
