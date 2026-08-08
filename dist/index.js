// src/polymarket-plugin.ts
import {
  BasePlugin
} from "@phantasy/agent/plugins";
import { createPluginModuleLogger } from "@phantasy/agent/plugin-runtime";

// src/config-resolve.ts
function resolveAllowTrading(config, key, envValue) {
  if (Object.prototype.hasOwnProperty.call(config, key)) {
    const value = config[key];
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return false;
  }
  return envValue === "true" || envValue === "1";
}

// src/polymarket-trading.ts
function normalizePrivateKey(key) {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("privateKey is required for trading");
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}
function assertTradingReady(config) {
  if (!config.allowTrading) {
    throw new Error(
      "Trading disabled. Turn on \u201CAllow trading\u201D in Admin \u2192 Plugins \u2192 Polymarket, then Save."
    );
  }
  if (!config.privateKey?.trim()) {
    throw new Error(
      "Trading private key missing. Set it in Admin \u2192 Plugins \u2192 Polymarket, then Save."
    );
  }
}
async function createAuthenticatedClobClient(config) {
  assertTradingReady(config);
  const [{ ClobClient, Chain, Side, OrderType }, { createWalletClient, http }, { privateKeyToAccount }] = await Promise.all([
    import("@polymarket/clob-client-v2"),
    import("viem"),
    import("viem/accounts")
  ]);
  const host = (config.clobBaseUrl || "https://clob.polymarket.com").replace(
    /\/$/,
    ""
  );
  const chainId = config.chainId === 80002 ? Chain.AMOY : Chain.POLYGON;
  const account = privateKeyToAccount(normalizePrivateKey(config.privateKey));
  const walletClient = createWalletClient({
    account,
    transport: http()
  });
  const l1 = new ClobClient({
    host,
    chain: chainId,
    signer: walletClient,
    funderAddress: config.funderAddress,
    throwOnError: true
  });
  const creds = await l1.createOrDeriveApiKey();
  const client = new ClobClient({
    host,
    chain: chainId,
    signer: walletClient,
    creds,
    funderAddress: config.funderAddress,
    throwOnError: true
  });
  return { client, Side, OrderType };
}
async function placeClobOrder(config, params) {
  assertTradingReady(config);
  const tokenId = params.tokenId.trim();
  if (!tokenId) throw new Error("tokenId is required");
  if (!(params.price > 0 && params.price < 1)) {
    throw new Error("price must be a probability between 0 and 1 (exclusive)");
  }
  if (!(params.size > 0)) {
    throw new Error("size must be positive");
  }
  const { client, Side, OrderType } = await createAuthenticatedClobClient(config);
  const side = params.side === "sell" ? Side.SELL : Side.BUY;
  let tickSize = params.tickSize;
  if (!tickSize) {
    try {
      tickSize = String(await client.getTickSize(tokenId));
    } catch {
      tickSize = "0.01";
    }
  }
  let negRisk = false;
  try {
    negRisk = Boolean(await client.getNegRisk(tokenId));
  } catch {
    negRisk = false;
  }
  const response = await client.createAndPostOrder(
    {
      tokenID: tokenId,
      price: params.price,
      size: params.size,
      side,
      ...params.expiration ? { expiration: params.expiration } : {}
    },
    { tickSize, negRisk },
    OrderType.GTC
  );
  return response;
}
async function cancelClobOrder(config, params) {
  assertTradingReady(config);
  const orderId = params.orderId.trim();
  if (!orderId) throw new Error("orderId is required");
  const { client } = await createAuthenticatedClobClient(config);
  return client.cancelOrder({ orderID: orderId });
}

// src/polymarket-service.ts
var log = {
  debug: (..._args) => void 0,
  info: (..._args) => void 0,
  warn: (..._args) => void 0,
  error: (..._args) => void 0
};
var DEFAULT_GAMMA = "https://gamma-api.polymarket.com";
var DEFAULT_CLOB = "https://clob.polymarket.com";
function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}
function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return [value];
    }
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}
var PolymarketService = class {
  gammaBase;
  clobBase;
  config;
  constructor(config = {}) {
    this.config = config;
    this.gammaBase = (config.gammaBaseUrl || DEFAULT_GAMMA).replace(/\/$/, "");
    this.clobBase = (config.clobBaseUrl || DEFAULT_CLOB).replace(/\/$/, "");
  }
  getStatus() {
    const hasKey = Boolean(this.config.privateKey?.trim());
    return {
      configured: true,
      tradingEnabled: Boolean(this.config.allowTrading && hasKey),
      gammaBaseUrl: this.gammaBase,
      clobBaseUrl: this.clobBase
    };
  }
  async getJson(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Polymarket HTTP ${response.status} for ${url}: ${text.slice(0, 200)}`
      );
    }
    return response.json();
  }
  normalizeMarket(raw) {
    const outcomePrices = parseMaybeJsonArray(raw.outcomePrices);
    const clobTokenIds = parseMaybeJsonArray(raw.clobTokenIds);
    const outcomes = parseMaybeJsonArray(raw.outcomes);
    return {
      ...raw,
      id: typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : void 0,
      question: typeof raw.question === "string" ? raw.question : void 0,
      slug: typeof raw.slug === "string" ? raw.slug : void 0,
      conditionId: typeof raw.conditionId === "string" ? raw.conditionId : typeof raw.condition_id === "string" ? raw.condition_id : void 0,
      endDate: typeof raw.endDate === "string" ? raw.endDate : void 0,
      active: typeof raw.active === "boolean" ? raw.active : void 0,
      closed: typeof raw.closed === "boolean" ? raw.closed : void 0,
      liquidity: raw.liquidity ?? raw.liquidityNum,
      volume: raw.volume ?? raw.volumeNum,
      outcomePrices,
      clobTokenIds,
      outcomes,
      description: typeof raw.description === "string" ? raw.description : void 0
    };
  }
  async searchMarkets(params = {}) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const url = new URL(`${this.gammaBase}/markets`);
    url.searchParams.set("limit", String(limit));
    if (params.active !== void 0) {
      url.searchParams.set("active", String(params.active));
    } else {
      url.searchParams.set("active", "true");
    }
    if (params.closed !== void 0) {
      url.searchParams.set("closed", String(params.closed));
    }
    if (params.tag) {
      url.searchParams.set("tag", params.tag);
    }
    const data = await this.getJson(url.toString());
    const list = Array.isArray(data) ? data : asRecord(data).markets;
    const markets = (Array.isArray(list) ? list : []).map((item) => this.normalizeMarket(asRecord(item))).filter((m) => Boolean(m.question || m.slug || m.id));
    const query = params.query?.trim().toLowerCase();
    if (!query) {
      return markets;
    }
    return markets.filter((m) => {
      const hay = `${m.question || ""} ${m.slug || ""} ${m.description || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }
  async getMarket(slugOrId) {
    const key = slugOrId.trim();
    if (!key) {
      throw new Error("slugOrId is required");
    }
    try {
      const bySlug = await this.getJson(
        `${this.gammaBase}/markets?slug=${encodeURIComponent(key)}`
      );
      const list = Array.isArray(bySlug) ? bySlug : [];
      if (list[0]) {
        return this.normalizeMarket(asRecord(list[0]));
      }
    } catch (error) {
      log.debug("slug market lookup failed", {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    const byId = await this.getJson(`${this.gammaBase}/markets/${encodeURIComponent(key)}`);
    return this.normalizeMarket(asRecord(byId));
  }
  async getEvent(slug) {
    const key = slug.trim();
    if (!key) throw new Error("event slug is required");
    return this.getJson(`${this.gammaBase}/events?slug=${encodeURIComponent(key)}`);
  }
  async getOrderBook(tokenId) {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(`${this.clobBase}/book?token_id=${encodeURIComponent(id)}`);
  }
  async getMidpoint(tokenId) {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(`${this.clobBase}/midpoint?token_id=${encodeURIComponent(id)}`);
  }
  async getPrice(tokenId, side = "buy") {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(
      `${this.clobBase}/price?token_id=${encodeURIComponent(id)}&side=${side}`
    );
  }
  /**
   * Place a signed CLOB limit order. Requires allowTrading + privateKey.
   */
  async placeOrder(params) {
    log.info("Placing Polymarket CLOB order", {
      tokenId: params.tokenId,
      side: params.side,
      price: params.price,
      size: params.size
    });
    return placeClobOrder(this.config, params);
  }
  /**
   * Cancel a resting CLOB order by id. Requires allowTrading + privateKey.
   */
  async cancelOrder(params) {
    return cancelClobOrder(this.config, params);
  }
  /**
   * List live short-horizon crypto up/down events (5m/15m × btc/eth/sol when present).
   */
  async listShortCrypto(params = {}) {
    const assets = params.assets || ["btc", "eth"];
    const intervals = params.intervals || ["5m", "15m"];
    const now = Math.floor(Date.now() / 1e3);
    const rows = [];
    for (const asset of assets) {
      for (const interval of intervals) {
        const windowSec = interval === "5m" ? 300 : 900;
        const bucket = now - now % windowSec;
        for (const ts of [bucket, bucket + windowSec, bucket - windowSec]) {
          const slug = `${asset}-updown-${interval}-${ts}`;
          try {
            const list = await this.getJson(
              `${this.gammaBase}/events?slug=${encodeURIComponent(slug)}`
            );
            const arr = Array.isArray(list) ? list : [];
            if (!arr[0]) continue;
            const event = asRecord(arr[0]);
            const markets = Array.isArray(event.markets) ? event.markets : [];
            const market = asRecord(markets[0] || {});
            const end = Date.parse(String(market.endDate || market.eventStartTime || "")) || (ts + windowSec) * 1e3;
            const start = Date.parse(String(market.eventStartTime || "")) || ts * 1e3;
            rows.push({
              asset,
              interval,
              slug: String(event.slug || slug),
              title: typeof event.title === "string" ? event.title : void 0,
              endsInSec: Math.max(0, (start + windowSec * 1e3 - Date.now()) / 1e3),
              outcomes: parseMaybeJsonArray(market.outcomes),
              outcomePrices: parseMaybeJsonArray(market.outcomePrices),
              clobTokenIds: parseMaybeJsonArray(market.clobTokenIds),
              feesEnabled: typeof market.feesEnabled === "boolean" ? market.feesEnabled : void 0,
              feeSchedule: market.feeSchedule
            });
            void end;
          } catch {
          }
        }
      }
    }
    rows.sort((a, b) => a.endsInSec - b.endsInSec);
    return rows;
  }
  /**
   * Polymarket crypto taker fee: fee = shares * feeRate * p * (1-p). Default feeRate 0.07.
   */
  estimateTakerFee(params) {
    const feeRate = params.feeRate ?? 0.07;
    const price = params.price;
    if (!(price > 0 && price < 1)) {
      throw new Error("price must be between 0 and 1 exclusive");
    }
    const shares = params.shares ?? (params.sizeUsd !== void 0 ? params.sizeUsd / price : void 0);
    if (!(shares && shares > 0)) {
      throw new Error("shares or sizeUsd required");
    }
    const raw = shares * feeRate * price * (1 - price);
    const feeUsd = Math.round(raw * 1e5) / 1e5;
    const notionalUsd = shares * price;
    return {
      shares,
      price,
      feeUsd: feeUsd < 1e-5 ? 0 : feeUsd,
      notionalUsd,
      allInUsd: notionalUsd + (feeUsd < 1e-5 ? 0 : feeUsd),
      feeRate
    };
  }
};

// src/polymarket-plugin.ts
var log2 = createPluginModuleLogger("PolymarketPlugin");
function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : void 0;
  }
  return void 0;
}
function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}
var PolymarketPlugin = class extends BasePlugin {
  name = "polymarket";
  version = "0.2.0-beta";
  description = "Polymarket prediction markets: public search/prices/books plus gated CLOB order placement.";
  displayName = "Polymarket";
  category = "markets";
  tags = ["polymarket", "prediction-markets", "trading", "finance"];
  permissions = ["internet"];
  workspace = "business";
  extensionKind = "integration";
  dataRetention = {
    stores: [
      {
        name: "agent_configs.polymarketConfig",
        kind: "config",
        description: "Polymarket API endpoints and optional trading credentials.",
        erasable: false
      }
    ],
    dataCategories: [
      "prediction market research queries",
      "optional wallet address metadata"
    ],
    externalServices: ["Polymarket Gamma API", "Polymarket CLOB API"],
    retentionDefault: "persist",
    erasable: false
  };
  adminSurface = {
    tabId: "polymarket",
    label: "Polymarket",
    workspace: "business",
    kind: "generic",
    advancedModule: "prediction-markets",
    keywords: ["polymarket", "prediction markets", "finance", "allow trading"]
  };
  configSchema = {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        default: true,
        title: "Enabled",
        description: "Load Polymarket tools and admin surface."
      },
      allowTrading: {
        type: "boolean",
        default: false,
        title: "Allow trading",
        description: "When on, order tools may place and cancel signed CLOB orders (requires wallet private key). Toggle anytime in this form \u2014 no restart required. Leave off for research-only agents."
      },
      privateKey: {
        type: "string",
        title: "Trading private key",
        description: "Polygon wallet private key for CLOB L1 auth. Stored via secret vault when Convex is configured. Not required for public research tools.",
        format: "password"
      },
      funderAddress: {
        type: "string",
        title: "Funder address",
        description: "Optional funder / proxy wallet address for CLOB trading."
      },
      chainId: {
        type: "number",
        default: 137,
        title: "Chain ID",
        description: "Polygon mainnet is 137."
      },
      gammaBaseUrl: {
        type: "string",
        default: "https://gamma-api.polymarket.com",
        title: "Gamma API URL",
        description: "Public market discovery API base URL."
      },
      clobBaseUrl: {
        type: "string",
        default: "https://clob.polymarket.com",
        title: "CLOB API URL",
        description: "Order book / trading API base URL."
      }
    }
  };
  service = null;
  resolveServiceConfig() {
    const cfg = this.getConfig();
    return {
      gammaBaseUrl: str(cfg.gammaBaseUrl) || process.env.POLYMARKET_GAMMA_URL,
      clobBaseUrl: str(cfg.clobBaseUrl) || process.env.POLYMARKET_CLOB_URL,
      privateKey: str(cfg.privateKey) || process.env.POLYMARKET_PRIVATE_KEY,
      funderAddress: str(cfg.funderAddress) || process.env.POLYMARKET_FUNDER_ADDRESS,
      chainId: num(cfg.chainId) ?? Number(process.env.POLYMARKET_CHAIN_ID || 137),
      allowTrading: resolveAllowTrading(
        cfg,
        "allowTrading",
        process.env.POLYMARKET_ALLOW_TRADING
      )
    };
  }
  getService() {
    if (!this.service) {
      this.service = new PolymarketService(this.resolveServiceConfig());
    }
    return this.service;
  }
  refreshService() {
    this.service = new PolymarketService(this.resolveServiceConfig());
  }
  async onInit(agentConfig, config) {
    await super.onInit(agentConfig, config);
    this.refreshService();
    log2.info("Polymarket plugin initialized", this.service?.getStatus());
  }
  async onConfigUpdated(newConfig) {
    await super.onConfigUpdated(newConfig);
    this.refreshService();
    log2.info("Polymarket config updated from admin UI", this.service?.getStatus());
  }
  getTools() {
    return [
      {
        name: "polymarket_search_markets",
        description: "Search Polymarket prediction markets (public Gamma API). Use for research and odds.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keyword filter" },
            limit: { type: "number", description: "Max results (1-100)" },
            active: { type: "boolean", description: "Only active markets" },
            tag: { type: "string", description: "Optional market tag" }
          }
        },
        handler: async (params) => {
          const markets = await this.getService().searchMarkets({
            query: str(params.query),
            limit: num(params.limit),
            active: params.active === void 0 ? true : bool(params.active, true),
            tag: str(params.tag)
          });
          return { count: markets.length, markets };
        }
      },
      {
        name: "polymarket_get_market",
        description: "Get a Polymarket market by slug or id.",
        parameters: {
          type: "object",
          properties: {
            slugOrId: {
              type: "string",
              description: "Market slug or id"
            }
          },
          required: ["slugOrId"]
        },
        handler: async (params) => {
          const slugOrId = str(params.slugOrId);
          if (!slugOrId) throw new Error("slugOrId is required");
          return this.getService().getMarket(slugOrId);
        }
      },
      {
        name: "polymarket_get_orderbook",
        description: "Get CLOB order book for a token id.",
        parameters: {
          type: "object",
          properties: {
            tokenId: { type: "string", description: "CLOB token id" }
          },
          required: ["tokenId"]
        },
        handler: async (params) => {
          const tokenId = str(params.tokenId);
          if (!tokenId) throw new Error("tokenId is required");
          return this.getService().getOrderBook(tokenId);
        }
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
              description: "midpoint (default) or price"
            }
          },
          required: ["tokenId"]
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
        }
      },
      {
        name: "polymarket_status",
        description: "Report Polymarket plugin configuration and trading readiness.",
        parameters: { type: "object", properties: {} },
        handler: async () => this.getService().getStatus()
      },
      {
        name: "polymarket_list_short_crypto",
        description: "List live short-horizon crypto up/down markets (BTC/ETH/SOL \xD7 5m/15m) with fee flags.",
        parameters: {
          type: "object",
          properties: {
            assets: {
              type: "string",
              description: "Comma list: btc,eth,sol (default btc,eth)"
            },
            intervals: {
              type: "string",
              description: "Comma list: 5m,15m (default both)"
            }
          }
        },
        handler: async (params) => {
          const assetsRaw = str(params.assets);
          const intervalsRaw = str(params.intervals);
          const assets = (assetsRaw || "btc,eth").split(",").map((s) => s.trim().toLowerCase()).filter(
            (s) => s === "btc" || s === "eth" || s === "sol"
          );
          const intervals = (intervalsRaw || "5m,15m").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s === "5m" || s === "15m");
          const markets = await this.getService().listShortCrypto({ assets, intervals });
          return { count: markets.length, markets };
        }
      },
      {
        name: "polymarket_estimate_fee",
        description: "Estimate crypto taker fee (shares * 0.07 * p * (1-p)). Makers pay 0.",
        parameters: {
          type: "object",
          properties: {
            price: { type: "number", description: "Share price 0-1" },
            shares: { type: "number" },
            sizeUsd: { type: "number", description: "Notional USD alternative to shares" },
            feeRate: { type: "number", description: "Default 0.07 crypto" }
          },
          required: ["price"]
        },
        handler: async (params) => {
          const price = num(params.price);
          if (price === void 0) throw new Error("price is required");
          return this.getService().estimateTakerFee({
            price,
            shares: num(params.shares),
            sizeUsd: num(params.sizeUsd),
            feeRate: num(params.feeRate)
          });
        }
      },
      {
        name: "polymarket_place_order",
        description: "Place a signed Polymarket CLOB limit order. Requires Allow trading + private key. Price is 0\u20131 probability.",
        parameters: {
          type: "object",
          properties: {
            tokenId: { type: "string", description: "CLOB token id" },
            side: { type: "string", description: "buy | sell" },
            price: {
              type: "number",
              description: "Limit price as probability (0\u20131 exclusive)"
            },
            size: { type: "number", description: "Order size in shares" },
            tickSize: {
              type: "string",
              description: "Optional tick size (default fetched from CLOB)"
            }
          },
          required: ["tokenId", "side", "price", "size"]
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
          if (price === void 0 || size === void 0) {
            throw new Error("price and size are required numbers");
          }
          return this.getService().placeOrder({
            tokenId,
            side: sideRaw,
            price,
            size,
            tickSize: str(params.tickSize)
          });
        }
      },
      {
        name: "polymarket_cancel_order",
        description: "Cancel a Polymarket CLOB order by id. Requires Allow trading + private key.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "Order id / hash" }
          },
          required: ["orderId"]
        },
        handler: async (params) => {
          const orderId = str(params.orderId);
          if (!orderId) throw new Error("orderId is required");
          return this.getService().cancelOrder({ orderId });
        }
      }
    ];
  }
  async handleCustomEndpoint(request, path) {
    const normalized = path.replace(/^\//, "");
    try {
      if (normalized === "status" || normalized === "" || normalized === "/") {
        return Response.json({ ok: true, data: this.getService().getStatus() });
      }
      if (normalized === "markets" && request.method === "GET") {
        const url = new URL(request.url);
        const markets = await this.getService().searchMarkets({
          query: url.searchParams.get("query") || void 0,
          limit: Number(url.searchParams.get("limit") || 20),
          active: url.searchParams.get("active") !== "false",
          tag: url.searchParams.get("tag") || void 0
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
          error: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  }
};
var polymarket_plugin_default = PolymarketPlugin;
export {
  PolymarketPlugin,
  PolymarketService,
  polymarket_plugin_default as default
};
//# sourceMappingURL=index.js.map