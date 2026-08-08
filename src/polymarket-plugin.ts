import {
  BasePlugin,
  type PluginDataDeclaration,
  type PluginTool,
} from "@phantasy/agent/plugins";
import { createPluginModuleLogger } from "@phantasy/agent/plugin-runtime";

import { resolveAllowTrading } from "./config-resolve.js";
import { PolymarketService } from "./polymarket-service.js";
import type { PolymarketServiceConfig } from "./polymarket-types.js";

export { resolveAllowTrading } from "./config-resolve.js";

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
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

export class PolymarketPlugin extends BasePlugin {
  name = "polymarket";
  version = "0.2.0-beta";
  description =
    "Polymarket prediction markets: public search/prices/books plus gated CLOB order placement.";

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
    keywords: ["polymarket", "prediction markets", "finance", "allow trading"],
  } as const;
  protected configSchema = {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        default: true,
        title: "Enabled",
        description: "Load Polymarket tools and admin surface.",
      },
      allowTrading: {
        type: "boolean",
        default: false,
        title: "Allow trading",
        description:
          "When on, order tools may place and cancel signed CLOB orders (requires wallet private key). Toggle anytime in this form — no restart required. Leave off for research-only agents.",
      },
      privateKey: {
        type: "string",
        title: "Trading private key",
        description:
          "Polygon wallet private key for CLOB L1 auth. Stored via secret vault when Convex is configured. Not required for public research tools.",
        format: "password",
      },
      funderAddress: {
        type: "string",
        title: "Funder address",
        description: "Optional funder / proxy wallet address for CLOB trading.",
      },
      chainId: {
        type: "number",
        default: 137,
        title: "Chain ID",
        description: "Polygon mainnet is 137.",
      },
      gammaBaseUrl: {
        type: "string",
        default: "https://gamma-api.polymarket.com",
        title: "Gamma API URL",
        description: "Public market discovery API base URL.",
      },
      clobBaseUrl: {
        type: "string",
        default: "https://clob.polymarket.com",
        title: "CLOB API URL",
        description: "Order book / trading API base URL.",
      },
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
      allowTrading: resolveAllowTrading(
        cfg,
        "allowTrading",
        process.env.POLYMARKET_ALLOW_TRADING,
      ),
    };
  }

  private getService(): PolymarketService {
    if (!this.service) {
      this.service = new PolymarketService(this.resolveServiceConfig());
    }
    return this.service;
  }

  private refreshService(): void {
    this.service = new PolymarketService(this.resolveServiceConfig());
  }

  override async onInit(
    agentConfig: Parameters<BasePlugin["onInit"]>[0],
    config?: Parameters<BasePlugin["onInit"]>[1],
  ): Promise<void> {
    await super.onInit(agentConfig, config);
    this.refreshService();
    log.info("Polymarket plugin initialized", this.service?.getStatus());
  }

  override async onConfigUpdated(
    newConfig: Parameters<BasePlugin["onConfigUpdated"]>[0],
  ): Promise<void> {
    await super.onConfigUpdated(newConfig);
    this.refreshService();
    log.info("Polymarket config updated from admin UI", this.service?.getStatus());
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
      {
        name: "polymarket_list_short_crypto",
        description:
          "List live short-horizon crypto up/down markets (BTC/ETH/SOL × 5m/15m) with fee flags.",
        parameters: {
          type: "object",
          properties: {
            assets: {
              type: "string",
              description: "Comma list: btc,eth,sol (default btc,eth)",
            },
            intervals: {
              type: "string",
              description: "Comma list: 5m,15m (default both)",
            },
          },
        },
        handler: async (params) => {
          const assetsRaw = str(params.assets);
          const intervalsRaw = str(params.intervals);
          const assets = (assetsRaw || "btc,eth")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s): s is "btc" | "eth" | "sol" =>
              s === "btc" || s === "eth" || s === "sol",
            );
          const intervals = (intervalsRaw || "5m,15m")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s): s is "5m" | "15m" => s === "5m" || s === "15m");
          const markets = await this.getService().listShortCrypto({ assets, intervals });
          return { count: markets.length, markets };
        },
      },
      {
        name: "polymarket_estimate_fee",
        description:
          "Estimate crypto taker fee (shares * 0.07 * p * (1-p)). Makers pay 0.",
        parameters: {
          type: "object",
          properties: {
            price: { type: "number", description: "Share price 0-1" },
            shares: { type: "number" },
            sizeUsd: { type: "number", description: "Notional USD alternative to shares" },
            feeRate: { type: "number", description: "Default 0.07 crypto" },
          },
          required: ["price"],
        },
        handler: async (params) => {
          const price = num(params.price);
          if (price === undefined) throw new Error("price is required");
          return this.getService().estimateTakerFee({
            price,
            shares: num(params.shares),
            sizeUsd: num(params.sizeUsd),
            feeRate: num(params.feeRate),
          });
        },
      },
      {
        name: "polymarket_place_order",
        description:
          "Place a signed Polymarket CLOB limit order. Requires Allow trading + private key. Price is 0–1 probability.",
        parameters: {
          type: "object",
          properties: {
            tokenId: { type: "string", description: "CLOB token id" },
            side: { type: "string", description: "buy | sell" },
            price: {
              type: "number",
              description: "Limit price as probability (0–1 exclusive)",
            },
            size: { type: "number", description: "Order size in shares" },
            tickSize: {
              type: "string",
              description: "Optional tick size (default fetched from CLOB)",
            },
          },
          required: ["tokenId", "side", "price", "size"],
        },
        handler: async (params) => {
          const tokenId = str(params.tokenId);
          if (!tokenId) throw new Error("tokenId is required");
          const sideRaw = str(params.side)?.toLowerCase();
          if (sideRaw !== "buy" && sideRaw !== "sell") {
            throw new Error('side must be "buy" or "sell"');
          }
          const price = num(params.price);
          const size = num(params.size);
          if (price === undefined || size === undefined) {
            throw new Error("price and size are required numbers");
          }
          return this.getService().placeOrder({
            tokenId,
            side: sideRaw,
            price,
            size,
            tickSize: str(params.tickSize),
          });
        },
      },
      {
        name: "polymarket_cancel_order",
        description:
          "Cancel a Polymarket CLOB order by id. Requires Allow trading + private key.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "Order id / hash" },
          },
          required: ["orderId"],
        },
        handler: async (params) => {
          const orderId = str(params.orderId);
          if (!orderId) throw new Error("orderId is required");
          return this.getService().cancelOrder({ orderId });
        },
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
