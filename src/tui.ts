import { createComponent } from "solid-js";
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { parseTreePluginOptions } from "./lib/config/plugin";
import { createSnapshotSessionTranscriptsLoader } from "./lib/opencode/messages";
import { resolveStorageRoot } from "./lib/storage";
import { treeRouteKeybindDefaults } from "./lib/tree/keybinds";
import { TreeRoute } from "./lib/tree/route";
import { resolveProjectRoot } from "./lib/tree/project";
import {
  getTreeRouteParamsForNavigation,
  isSessionRoute,
  parseTreeRouteParams,
} from "./lib/tree/route-params";

const id = "opencode.tree";
const routeName = "tree";

const tui: TuiPlugin = async (api, options) => {
  const pluginOptions = parseTreePluginOptions(options);
  const treeRouteKeybinds = api.keybind.create(treeRouteKeybindDefaults, pluginOptions.keybinds);

  api.command.register(() => {
    const current = api.route.current;
    const inSession = isSessionRoute(current);

    return [
      {
        title: "Tree",
        value: "tree.open",
        category: "Plugin",
        hidden: !inSession,
        enabled: inSession,
        slash: {
          name: "tree",
        },
        onSelect: () => {
          api.route.navigate(routeName, getTreeRouteParamsForNavigation(api.route.current));
        },
      },
    ];
  });

  api.route.register([
    {
      name: routeName,
      render: ({ params }) => {
        const projectRoot = resolveProjectRoot(api.state.path);
        const storageRoot = projectRoot
          ? resolveStorageRoot({
              projectRoot,
              stateRoot: api.state.path.state,
              storageScope: pluginOptions.storageScope,
            })
          : undefined;

        return createComponent(TreeRoute, {
          client: api.client,
          config: {
            storageRoot,
            keybinds: treeRouteKeybinds,
            linesPerJump: pluginOptions.lines_per_jump,
          },
          ui: {
            dialog: api.ui.dialog,
            DialogPrompt: api.ui.DialogPrompt,
            DialogSelect: api.ui.DialogSelect,
          },
          projectRoot,
          theme: () => api.theme.current,
          loadSessionTranscripts: createSnapshotSessionTranscriptsLoader(api.client, {
            directory: projectRoot,
          }),
          navigateToSession: (sessionId: string) => {
            api.route.navigate("session", { sessionID: sessionId });
          },
          ...parseTreeRouteParams(params),
        });
      },
    },
  ]);
};

export default {
  id,
  tui,
} satisfies TuiPluginModule & { id: string };
