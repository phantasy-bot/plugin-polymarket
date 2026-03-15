import { BasePlugin, type PluginTool } from "@phantasy/agent/plugins";

export class PolymarketPlugin extends BasePlugin {
  name = "polymarket";
  version = "2.0.0";
  description = "Polymarket prediction-market integration plugin for Phantasy.";

  protected displayName = "Polymarket";
  protected category = "markets";
  protected tags = ["polymarket","prediction-markets","trading","finance"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "integration" as const;
  protected adminSurface =   {
    "tabId": "polymarket",
    "label": "Polymarket",
    "section": "business",
    "workspace": "business",
    "kind": "generic",
    "keywords": [
      "polymarket",
      "prediction-markets",
      "trading",
      "finance"
    ]
  } as const;
  protected configSchema =   {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true
      }
    }
  };

  getTools(): PluginTool[] {
    return [];
  }
}

export default PolymarketPlugin;
