/**
 * Polymarket market data via Gamma (public) + CLOB read endpoints.
 * Order placement stays gated behind allowTrading + private key (future CLOB client).
 */

import type {
  PolymarketMarketSummary,
  PolymarketSearchParams,
  PolymarketServiceConfig,
} from "./polymarket-types.js";

const log = {
  debug: (..._args: unknown[]) => undefined,
  info: (..._args: unknown[]) => undefined,
  warn: (..._args: unknown[]) => undefined,
  error: (..._args: unknown[]) => undefined,
};

const DEFAULT_GAMMA = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB = "https://clob.polymarket.com";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseMaybeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
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

export class PolymarketService {
  private readonly gammaBase: string;
  private readonly clobBase: string;
  private readonly config: PolymarketServiceConfig;

  constructor(config: PolymarketServiceConfig = {}) {
    this.config = config;
    this.gammaBase = (config.gammaBaseUrl || DEFAULT_GAMMA).replace(/\/$/, "");
    this.clobBase = (config.clobBaseUrl || DEFAULT_CLOB).replace(/\/$/, "");
  }

  getStatus(): {
    configured: boolean;
    tradingEnabled: boolean;
    gammaBaseUrl: string;
    clobBaseUrl: string;
  } {
    const hasKey = Boolean(this.config.privateKey?.trim());
    return {
      configured: true,
      tradingEnabled: Boolean(this.config.allowTrading && hasKey),
      gammaBaseUrl: this.gammaBase,
      clobBaseUrl: this.clobBase,
    };
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Polymarket HTTP ${response.status} for ${url}: ${text.slice(0, 200)}`,
      );
    }
    return response.json();
  }

  normalizeMarket(raw: Record<string, unknown>): PolymarketMarketSummary {
    const outcomePrices = parseMaybeJsonArray(raw.outcomePrices);
    const clobTokenIds = parseMaybeJsonArray(raw.clobTokenIds);
    const outcomes = parseMaybeJsonArray(raw.outcomes);
    return {
      ...raw,
      id: typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : undefined,
      question: typeof raw.question === "string" ? raw.question : undefined,
      slug: typeof raw.slug === "string" ? raw.slug : undefined,
      conditionId:
        typeof raw.conditionId === "string"
          ? raw.conditionId
          : typeof raw.condition_id === "string"
            ? raw.condition_id
            : undefined,
      endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
      active: typeof raw.active === "boolean" ? raw.active : undefined,
      closed: typeof raw.closed === "boolean" ? raw.closed : undefined,
      liquidity: (raw.liquidity ?? raw.liquidityNum) as string | number | undefined,
      volume: (raw.volume ?? raw.volumeNum) as string | number | undefined,
      outcomePrices,
      clobTokenIds,
      outcomes,
      description: typeof raw.description === "string" ? raw.description : undefined,
    };
  }

  async searchMarkets(params: PolymarketSearchParams = {}): Promise<PolymarketMarketSummary[]> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const url = new URL(`${this.gammaBase}/markets`);
    url.searchParams.set("limit", String(limit));
    if (params.active !== undefined) {
      url.searchParams.set("active", String(params.active));
    } else {
      url.searchParams.set("active", "true");
    }
    if (params.closed !== undefined) {
      url.searchParams.set("closed", String(params.closed));
    }
    if (params.tag) {
      url.searchParams.set("tag", params.tag);
    }

    const data = await this.getJson(url.toString());
    const list = Array.isArray(data) ? data : asRecord(data).markets;
    const markets = (Array.isArray(list) ? list : [])
      .map((item) => this.normalizeMarket(asRecord(item)))
      .filter((m) => Boolean(m.question || m.slug || m.id));

    const query = params.query?.trim().toLowerCase();
    if (!query) {
      return markets;
    }
    return markets.filter((m) => {
      const hay = `${m.question || ""} ${m.slug || ""} ${m.description || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }

  async getMarket(slugOrId: string): Promise<PolymarketMarketSummary> {
    const key = slugOrId.trim();
    if (!key) {
      throw new Error("slugOrId is required");
    }

    // Prefer slug lookup; fall back to id
    try {
      const bySlug = await this.getJson(
        `${this.gammaBase}/markets?slug=${encodeURIComponent(key)}`,
      );
      const list = Array.isArray(bySlug) ? bySlug : [];
      if (list[0]) {
        return this.normalizeMarket(asRecord(list[0]));
      }
    } catch (error) {
      log.debug("slug market lookup failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const byId = await this.getJson(`${this.gammaBase}/markets/${encodeURIComponent(key)}`);
    return this.normalizeMarket(asRecord(byId));
  }

  async getEvent(slug: string): Promise<unknown> {
    const key = slug.trim();
    if (!key) throw new Error("event slug is required");
    return this.getJson(`${this.gammaBase}/events?slug=${encodeURIComponent(key)}`);
  }

  async getOrderBook(tokenId: string): Promise<unknown> {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(`${this.clobBase}/book?token_id=${encodeURIComponent(id)}`);
  }

  async getMidpoint(tokenId: string): Promise<unknown> {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(`${this.clobBase}/midpoint?token_id=${encodeURIComponent(id)}`);
  }

  async getPrice(tokenId: string, side: "buy" | "sell" = "buy"): Promise<unknown> {
    const id = tokenId.trim();
    if (!id) throw new Error("tokenId is required");
    return this.getJson(
      `${this.clobBase}/price?token_id=${encodeURIComponent(id)}&side=${side}`,
    );
  }

  /**
   * Trading is intentionally not auto-enabled. Wire @polymarket/clob-client when ready.
   */
  async placeOrder(_params: {
    tokenId: string;
    side: "buy" | "sell";
    price: number;
    size: number;
  }): Promise<never> {
    if (!this.config.allowTrading || !this.config.privateKey?.trim()) {
      throw new Error(
        "Trading disabled. Turn on “Allow trading” and set a trading private key in Admin → Plugins → Polymarket (or Business → Polymarket), then Save.",
      );
    }
    throw new Error(
      "Polymarket is research-only in this build: CLOB order placement is not wired to a signed client. Use public market tools, or track a future release that ships signed trading.",
    );
  }
}
