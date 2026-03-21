/**
 * @module PolymarketService
 *
 * Official Polymarket API integration for prediction markets.
 * Documentation: https://docs.polymarket.com/quickstart/overview
 *
 * Supported endpoints:
 * - Markets: List, search, get details
 * - Orders: Get orders, create orders
 * - Positions: Get portfolio positions
 * - Users: Get user profile
 */

import {
  createPluginModuleLogger,
  fetchWithTimeout,
} from "@phantasy/agent/plugin-runtime";

const log = createPluginModuleLogger("PolymarketService");

export interface PolymarketConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  slug: string;
  endDate: string;
  ticker: string;
  outcomePrices: {
    yes: number;
    no: number;
  };
  markets: Array<{
    tokenID: string;
    outcome: string;
    price: number;
  }>;
  liquidity: number;
  volume24h: number;
  status: "open" | "closed" | "settled";
}

export interface PolymarketOrder {
  id: string;
  marketId: string;
  tokenId: string;
  outcome: "yes" | "no";
  type: "buy" | "sell";
  price: number;
  size: number;
  status: "pending" | "filled" | "cancelled" | "failed";
  timestamp: string;
}

export interface PolymarketPosition {
  tokenId: string;
  marketId: string;
  marketQuestion: string;
  outcome: "yes" | "no";
  size: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface PolymarketPortfolio {
  totalValue: number;
  totalPnl: number;
  positions: PolymarketPosition[];
}

export class PolymarketService {
  private config: Required<PolymarketConfig>;
  private baseUrl: string;

  constructor(config: PolymarketConfig = {}) {
    this.config = {
      apiKey: config.apiKey || "",
      baseUrl: config.baseUrl || "https://api.poly.market",
    };
    this.baseUrl = this.config.baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    if (this.config.apiKey) {
      headers.set("Authorization", `Bearer ${this.config.apiKey}`);
    }

    if (options.headers) {
      const existingHeaders = options.headers as Record<string, string>;
      Object.entries(existingHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    log.debug(`Polymarket API request: ${options.method || "GET"} ${url}`);

    try {
      const response = await fetchWithTimeout(url, {
        timeout: 15000,
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Polymarket API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      log.error("Polymarket API request failed", error);
      throw error;
    }
  }

  /**
   * Get user portfolio with positions
   */
  async getPortfolio(userAddress: string): Promise<PolymarketPortfolio> {
    try {
      const positions = await this.request<PolymarketPosition[]>(
        `/user/${userAddress}/positions`,
      );

      const totalValue = positions.reduce((sum, pos) => sum + pos.size * pos.currentPrice, 0);
      const totalPnl = positions.reduce(
        (sum, pos) => sum + pos.realizedPnl + pos.unrealizedPnl,
        0,
      );

      return {
        totalValue,
        totalPnl,
        positions,
      };
    } catch (error) {
      log.error("Failed to get Polymarket portfolio", error);
      throw error;
    }
  }

  /**
   * Get markets list with optional filters
   */
  async getMarkets(options: {
    limit?: number;
    offset?: number;
    status?: "open" | "closed" | "settled";
    search?: string;
  } = {}): Promise<PolymarketMarket[]> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    if (options.status) params.append("status", options.status);
    if (options.search) params.append("query", options.search);

    const endpoint = `/markets${params.toString() ? `?${params.toString()}` : ""}`;

    try {
      return await this.request<PolymarketMarket[]>(endpoint);
    } catch (error) {
      log.error("Failed to get Polymarket markets", error);
      throw error;
    }
  }

  /**
   * Get market details by ID
   */
  async getMarket(marketId: string): Promise<PolymarketMarket> {
    try {
      return await this.request<PolymarketMarket>(`/markets/${marketId}`);
    } catch (error) {
      log.error(`Failed to get Polymarket market ${marketId}`, error);
      throw error;
    }
  }

  /**
   * Search markets by question
   */
  async searchMarkets(query: string, limit = 20): Promise<PolymarketMarket[]> {
    return this.getMarkets({ search: query, limit });
  }

  /**
   * Get orders for a user
   */
  async getOrders(userAddress: string): Promise<PolymarketOrder[]> {
    try {
      return await this.request<PolymarketOrder[]>(`/user/${userAddress}/orders`);
    } catch (error) {
      log.error("Failed to get Polymarket orders", error);
      throw error;
    }
  }

  /**
   * Create a new order
   */
  async createOrder(params: {
    marketId: string;
    tokenId: string;
    outcome: "yes" | "no";
    type: "buy" | "sell";
    price: number;
    size: number;
  }): Promise<PolymarketOrder> {
    try {
      return await this.request<PolymarketOrder>(`/orders`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    } catch (error) {
      log.error("Failed to create Polymarket order", error);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.request<void>(`/orders/${orderId}`, {
        method: "DELETE",
      });
    } catch (error) {
      log.error(`Failed to cancel Polymarket order ${orderId}`, error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<PolymarketOrder> {
    try {
      return await this.request<PolymarketOrder>(`/orders/${orderId}`);
    } catch (error) {
      log.error(`Failed to get Polymarket order ${orderId}`, error);
      throw error;
    }
  }

  /**
   * Get positions for a user
   */
  async getPositions(userAddress: string): Promise<PolymarketPosition[]> {
    try {
      return await this.request<PolymarketPosition[]>(
        `/user/${userAddress}/positions`,
      );
    } catch (error) {
      log.error("Failed to get Polymarket positions", error);
      throw error;
    }
  }

  /**
   * Get wallet balance (if available via API)
   */
  async getBalance(userAddress: string): Promise<{ balance: number; currency: string }> {
    const portfolio = await this.getPortfolio(userAddress);
    return {
      balance: portfolio.totalValue,
      currency: "USDC",
    };
  }
}

let polymarketServiceInstance: PolymarketService | null = null;

export function getPolymarketService(config?: PolymarketConfig): PolymarketService {
  if (!polymarketServiceInstance) {
    polymarketServiceInstance = new PolymarketService(config);
  }
  return polymarketServiceInstance;
}
