import {
  BasePlugin,
  type PluginDataDeclaration,
  type PluginTool,
} from "@phantasy/agent/plugins";
import { createPluginModuleLogger } from "@phantasy/agent/plugin-runtime";

import { PolymarketService } from "./polymarket-service.js";
import type { PolymarketServiceConfig } from "./polymarket-types.js";

const log = createPluginModuleLogger("PolymarketPlugin");

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export class PolymarketPlugin extends BasePlugin {
  name = "polymarket";
  version = "0.1.0-beta";
  description =
    "Polymarket prediction markets: search, prices, order books, and gated trading.";

  protected displayName = "Polymarket";
  protected category = "markets";
  protected tags = ["polymarket", "prediction-markets", "trading", "finance"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "integration" as const;
  protected dataRetention: PluginDataDeclaration = {
    stores: [
      {
        name: "agent_configs.polymarketConfig",
        kind: "config",
        description: "Polymarket API endpoints and optional trading credentials.",
        erasable: false,
      },
    ],
    dataCategories: [
      "prediction market research queries",
      "optional wallet address metadata",
    ],
    externalServices: ["Polymarket Gamma API", "Polymarket CLOB API"],
    retentionDefault: "persist",
    erasable: false,
  };
  protected adminSurface = {
    tabId: "polymarket",
    label: "Polymarket",
    workspace: "business",
    kind: "generic",
    advancedModule: "prediction-markets",
    keywords: ["polymarket", "prediction markets", "finance"],
  } as const;
  protected configSchema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
      gammaBaseUrl: {
        type: "string",
        default: "https://gamma-api.polymarket.com",
      },
      clobBaseUrl: {
        type: "string",
        default: "https://clob.polymarket.com",
      },
      privateKey: { type: "string" },
      funderAddress: { type: "string" },
      chainId: { type: "number", default: 137 },
      allowTrading: { type: "boolean", default: false },
    },
  };

  private service: PolymarketService | null = null;

  private resolveServiceConfig(): PolymarketServiceConfig {
    const cfg = this.getConfig() as Record<string, unknown>;
    return {
      gammaBaseUrl: str(cfg.gammaBaseUrl) || process.env.POLYMARKET_GAMMA_URL,
      clobBaseUrl: str(cfg.clobBaseUrl) || process.env.POLYMARKET_CLOB_URL,
      privateKey: str(cfg.privateKey) || process.env.POLYMARKET_PRIVATE_KEY,
      funderAddress: str(cfg.funderAddress) || process.env.POLYMARKET_FUNDER_ADDRESS,
      chainId: num(cfg.chainId) ?? Number(process.env.POLYMARKET_CHAIN_ID || 137),
      allowTrading:
        bool(cfg.allowTrading, false) ||
        process.env.POLYMARKET_ALLOW_TRADING === "true",
    };
  }

  private getService(): PolymarketService {
    if (!this.service) {
      this.service = new PolymarketService(this.resolveServiceConfig());
    }
    return this.service;
  }

  override async onInit(
    agentConfig: Parameters<BasePlugin["onInit"]>[0],
    config?: Parameters<BasePlugin["onInit"]>[1],
  ): Promise<void> {
    await super.onInit(agentConfig, config);
    this.service = new PolymarketService(this.resolveServiceConfig());
    log.info("Polymarket plugin initialized", this.service.getStatus());
  }

  getTools(): PluginTool[] {
    return [
      {
        name: "polymarket_search_markets",
        description:
          "Search Polymarket prediction markets (public Gamma API). Use for research and odds.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keyword filter" },
            limit: { type: "number", description: "Max results (1-100)" },
            active: { type: "boolean", description: "Only active markets" },
            tag: { type: "string", description: "Optional market tag" },
          },
        },
        handler: async (params) => {
          const markets = await this.getService().searchMarkets({
            query: str(params.query),
            limit: num(params.limit),
            active: params.active === undefined ? true : bool(params.active, true),
            tag: str(params.tag),
          });
          return { count: markets.length, markets };
        },
      },
      {
        name: "polymarket_get_market",
        description: "Get a Polymarket market by slug or id.",
        parameters: {
          type: "object",
          properties: {
            slugOrId: {
              type: "string",
              description: "Market slug or id",
            },
          },
          required: ["slugOrId"],
        },
        handler: async (params) => {
          const slugOrId = str(params.slugOrId);
          if (!slugOrId) throw new Error("slugOrId is required");
          return this.getService().getMarket(slugOrId);
        },
      },
      {
        name: "polymarket_get_orderbook",
        description: "Get CLOB order book for a token id.",
        parameters: {
          type: "object",
          properties: {
            tokenId: { type: "string", description: "CLOB token id" },
          },
          required: ["tokenId"],
        },
        handler: async (params) => {
          const tokenId = str(params.tokenId);
          if (!tokenId) throw new Error("tokenId is required");
          return this.getService().getOrderBook(tokenId);
        },
      },
      {
        name: "polymarket_get_price",
        description: "Get CLOB midpoint/price for a token id.",
        parameters: {
          type: "object",
          properties: {
            tokenId: { type: "string" },
            side: { type: "string", description: "buy or sell" },
            mode: {
              type: "string",
              description: "midpoint (default) or price",
            },
          },
          required: ["tokenId"],
        },
        handler: async (params) => {
          const tokenId = str(params.tokenId);
          if (!tokenId) throw new Error("tokenId is required");
          const mode = str(params.mode) || "midpoint";
          if (mode === "price") {
            const side = str(params.side) === "sell" ? "sell" : "buy";
            return this.getService().getPrice(tokenId, side);
          }
          return this.getService().getMidpoint(tokenId);
        },
      },
      {
        name: "polymarket_status",
        description: "Report Polymarket plugin configuration and trading readiness.",
        parameters: { type: "object", properties: {} },
        handler: async () => this.getService().getStatus(),
      },
    ];
  }

  async handleCustomEndpoint(
    request: Request,
    path: string,
  ): Promise<Response | null> {
    const normalized = path.replace(/^\//, "");
    try {
      if (normalized === "status" || normalized === "" || normalized === "/") {
        return Response.json({ ok: true, data: this.getService().getStatus() });
      }
      if (normalized === "markets" && request.method === "GET") {
        const url = new URL(request.url);
        const markets = await this.getService().searchMarkets({
          query: url.searchParams.get("query") || undefined,
          limit: Number(url.searchParams.get("limit") || 20),
          active: url.searchParams.get("active") !== "false",
          tag: url.searchParams.get("tag") || undefined,
        });
        return Response.json({ ok: true, data: markets });
      }
      if (normalized.startsWith("markets/") && request.method === "GET") {
        const slugOrId = decodeURIComponent(normalized.slice("markets/".length));
        const market = await this.getService().getMarket(slugOrId);
        return Response.json({ ok: true, data: market });
      }
      return null;
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  }
}

export default PolymarketPlugin;
