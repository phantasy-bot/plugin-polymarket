export interface PolymarketServiceConfig {
  gammaBaseUrl?: string;
  clobBaseUrl?: string;
  /** Optional wallet private key for trading (never log). */
  privateKey?: string;
  funderAddress?: string;
  chainId?: number;
  allowTrading?: boolean;
}

export interface PolymarketMarketSummary {
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

export interface PolymarketSearchParams {
  query?: string;
  limit?: number;
  active?: boolean;
  closed?: boolean;
  tag?: string;
}
