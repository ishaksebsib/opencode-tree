import { createComponent } from "solid-js"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { TreeRoute } from "./lib/tree/route"
import {
  getTreeRouteParamsForNavigation,
  isSessionRoute,
  parseTreeRouteParams,
} from "./lib/tree/route-params"

const id = "opencode.tree"
const routeName = "tree"

const tui: TuiPlugin = async (api) => {
  api.command.register(() => {
    const current = api.route.current
    const inSession = isSessionRoute(current)

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
          api.route.navigate(routeName, getTreeRouteParamsForNavigation(api.route.current))
        },
      },
    ]
  })

  api.route.register([
    {
      name: routeName,
      render: ({ params }) => createComponent(TreeRoute, parseTreeRouteParams(params)),
    },
  ])
}

export default {
  id,
  tui,
} satisfies TuiPluginModule & { id: string }
