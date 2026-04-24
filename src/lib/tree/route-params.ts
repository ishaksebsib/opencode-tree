import type { TuiRouteCurrent } from "@opencode-ai/plugin/tui";

export type TreeRouteParams = {
  readonly sessionID?: string;
};

export function isSessionRoute(
  current: TuiRouteCurrent,
): current is Extract<TuiRouteCurrent, { name: "session" }> {
  return current.name === "session";
}

export function getTreeRouteParamsForNavigation(
  current: TuiRouteCurrent,
): TreeRouteParams | undefined {
  if (!isSessionRoute(current)) return undefined;
  return { sessionID: current.params.sessionID };
}

export function parseTreeRouteParams(params: Record<string, unknown> | undefined): TreeRouteParams {
  const sessionID = typeof params?.sessionID === "string" ? params.sessionID : undefined;
  return sessionID ? { sessionID } : {};
}
