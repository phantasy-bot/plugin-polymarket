import { BasePlugin, PluginDataDeclaration, PluginTool } from '@phantasy/agent/plugins';

declare class PolymarketPlugin extends BasePlugin {
    name: string;
    version: string;
    description: string;
    protected displayName: string;
    protected category: string;
    protected tags: string[];
    protected permissions: string[];
    protected workspace: "business";
    protected extensionKind: "integration";
    protected dataRetention: PluginDataDeclaration;
    protected adminSurface: {
        readonly tabId: "polymarket";
        readonly label: "Polymarket";
        readonly workspace: "business";
        readonly kind: "generic";
        readonly advancedModule: "prediction-markets";
        readonly keywords: readonly ["polymarket", "prediction markets", "finance", "allow trading"];
    };
    protected configSchema: {
        type: string;
        properties: {
            enabled: {
                type: string;
                default: boolean;
                title: string;
                description: string;
            };
            allowTrading: {
                type: string;
                default: boolean;
                title: string;
                description: string;
            };
            privateKey: {
                type: string;
                title: string;
                description: string;
                format: string;
            };
            funderAddress: {
                type: string;
                title: string;
                description: string;
            };
            chainId: {
                type: string;
                default: number;
                title: string;
                description: string;
            };
            gammaBaseUrl: {
                type: string;
                default: string;
                title: string;
                description: string;
            };
            clobBaseUrl: {
                type: string;
                default: string;
                title: string;
                description: string;
            };
        };
    };
    private service;
    private resolveServiceConfig;
    private getService;
    private refreshService;
    onInit(agentConfig: Parameters<BasePlugin["onInit"]>[0], config?: Parameters<BasePlugin["onInit"]>[1]): Promise<void>;
    onConfigUpdated(newConfig: Parameters<BasePlugin["onConfigUpdated"]>[0]): Promise<void>;
    getTools(): PluginTool[];
    handleCustomEndpoint(request: Request, path: string): Promise<Response | null>;
}

interface PolymarketServiceConfig {
    gammaBaseUrl?: string;
    clobBaseUrl?: string;
    /** Optional wallet private key for trading (never log). */
    privateKey?: string;
    funderAddress?: string;
    chainId?: number;
    allowTrading?: boolean;
}
interface PolymarketMarketSummary {
    id?: string;
    question?: string;
    slug?: string;
    conditionId?: string;
    endDate?: string;
    active?: boolean;
    closed?: boolean;
    liquidity?: string | number;
    volume?: string | number;
    outcomePrices?: string | string[];
    clobTokenIds?: string | string[];
    outcomes?: string | string[];
    description?: string;
    [key: string]: unknown;
}
interface PolymarketSearchParams {
    query?: string;
    limit?: number;
    active?: boolean;
    closed?: boolean;
    tag?: string;
}

/**
 * Signed CLOB trading via @polymarket/clob-client-v2 + viem wallet.
 */

type PlaceOrderParams = {
    tokenId: string;
    side: "buy" | "sell";
    price: number;
    size: number;
    /** Optional tick size override (default: fetch from CLOB or 0.01). */
    tickSize?: string;
    /** Optional GTD expiration unix seconds. */
    expiration?: number;
};
type CancelOrderParams = {
    orderId: string;
};

/**
 * Polymarket market data via Gamma (public) + CLOB read endpoints.
 * Order placement uses @polymarket/clob-client-v2 when allowTrading + privateKey are set.
 */

declare class PolymarketService {
    private readonly gammaBase;
    private readonly clobBase;
    private readonly config;
    constructor(config?: PolymarketServiceConfig);
    getStatus(): {
        configured: boolean;
        tradingEnabled: boolean;
        gammaBaseUrl: string;
        clobBaseUrl: string;
    };
    private getJson;
    normalizeMarket(raw: Record<string, unknown>): PolymarketMarketSummary;
    searchMarkets(params?: PolymarketSearchParams): Promise<PolymarketMarketSummary[]>;
    getMarket(slugOrId: string): Promise<PolymarketMarketSummary>;
    getEvent(slug: string): Promise<unknown>;
    getOrderBook(tokenId: string): Promise<unknown>;
    getMidpoint(tokenId: string): Promise<unknown>;
    getPrice(tokenId: string, side?: "buy" | "sell"): Promise<unknown>;
    /**
     * Place a signed CLOB limit order. Requires allowTrading + privateKey.
     */
    placeOrder(params: PlaceOrderParams): Promise<unknown>;
    /**
     * Cancel a resting CLOB order by id. Requires allowTrading + privateKey.
     */
    cancelOrder(params: CancelOrderParams): Promise<unknown>;
    /**
     * List live short-horizon crypto up/down events (5m/15m × btc/eth/sol when present).
     */
    listShortCrypto(params?: {
        assets?: Array<"btc" | "eth" | "sol">;
        intervals?: Array<"5m" | "15m">;
    }): Promise<Array<{
        asset: string;
        interval: string;
        slug: string;
        title?: string;
        endsInSec: number;
        outcomes?: string[];
        outcomePrices?: string[];
        clobTokenIds?: string[];
        feesEnabled?: boolean;
        feeSchedule?: unknown;
    }>>;
    /**
     * Polymarket crypto taker fee: fee = shares * feeRate * p * (1-p). Default feeRate 0.07.
     */
    estimateTakerFee(params: {
        price: number;
        shares?: number;
        sizeUsd?: number;
        feeRate?: number;
    }): {
        shares: number;
        price: number;
        feeUsd: number;
        notionalUsd: number;
        allInUsd: number;
        feeRate: number;
    };
}

export { type PolymarketMarketSummary, PolymarketPlugin, type PolymarketSearchParams, PolymarketService, type PolymarketServiceConfig, PolymarketPlugin as default };
