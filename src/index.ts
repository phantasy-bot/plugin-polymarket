import { BasePlugin, PluginManifest, PluginTool } from "@phantasy/core";

export class UpolymarketPlugin extends BasePlugin {
  readonly name = "polymarket";
  readonly version = "1.0.0";

  getManifest(): PluginManifest {
    return {
      name: this.name,
      version: this.version,
      description: "polymarket plugin for Phantasy",
      author: "Phantasy",
      license: "BUSL-1.1",
      repository: "https://github.com/phantasy-bot/plugin-polymarket",
    };
  }

  getTools(): PluginTool[] {
    return [];
  }

  async initialize(): Promise<void> {
    console.log("[UpolymarketPlugin] Initialized");
  }
}

export default UpolymarketPlugin;
