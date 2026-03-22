import { BasePlugin, type PluginTool } from "@phantasy/agent/plugins";

export class PolymarketPlugin extends BasePlugin {
  name = "polymarket";
  version = "0.1.0";
  description = "Polymarket prediction-market integration for Phantasy.";

  protected displayName = "Polymarket";
  protected category = "markets";
  protected tags = ["polymarket", "prediction-markets", "trading", "finance"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "integration" as const;
  protected adminSurface = {
    tabId: "polymarket",
    label: "Polymarket",
    section: "business",
    workspace: "business",
    kind: "generic",
    advancedModule: "prediction-markets",
    keywords: ["polymarket", "prediction markets", "finance"],
  } as const;
  protected configSchema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
      walletAddress: { type: "string" },
    },
  };

  getTools(): PluginTool[] {
    return [];
  }

  async handleCustomEndpoint(
    _request: Request,
    path: string,
  ): Promise<Response | null> {
    if (path === "/status" || path === "" || path === "/") {
      return new Response(
        JSON.stringify({
          configured: false,
          migrated: false,
          requires: ["@phantasy/plugin-wallet"],
          message:
            "Polymarket is installable as a standalone plugin surface, but richer runtime actions are still being migrated out of the core repo.",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return null;
  }
}

export default PolymarketPlugin;
