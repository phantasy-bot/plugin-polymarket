/**
 * Signed CLOB trading via @polymarket/clob-client-v2 + viem wallet.
 */

import type { PolymarketServiceConfig } from "./polymarket-types.js";

export type PlaceOrderParams = {
  tokenId: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  /** Optional tick size override (default: fetch from CLOB or 0.01). */
  tickSize?: string;
  /** Optional GTD expiration unix seconds. */
  expiration?: number;
};

export type CancelOrderParams = {
  orderId: string;
};

function normalizePrivateKey(key: string): `0x${string}` {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("privateKey is required for trading");
  }
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

function assertTradingReady(config: PolymarketServiceConfig): void {
  if (!config.allowTrading) {
    throw new Error(
      "Trading disabled. Turn on “Allow trading” in Admin → Plugins → Polymarket, then Save.",
    );
  }
  if (!config.privateKey?.trim()) {
    throw new Error(
      "Trading private key missing. Set it in Admin → Plugins → Polymarket, then Save.",
    );
  }
}

/**
 * Build an authenticated CLOB client (L1 wallet + derived L2 API creds).
 */
export async function createAuthenticatedClobClient(
  config: PolymarketServiceConfig,
): Promise<{
  client: {
    createAndPostOrder: (...args: any[]) => Promise<unknown>;
    cancelOrder: (payload: { orderID: string }) => Promise<unknown>;
    getTickSize: (tokenID: string) => Promise<string>;
    getNegRisk: (tokenID: string) => Promise<boolean>;
  };
  Side: { BUY: string; SELL: string };
  OrderType: { GTC: string };
}> {
  assertTradingReady(config);

  const [{ ClobClient, Chain, Side, OrderType }, { createWalletClient, http }, { privateKeyToAccount }] =
    await Promise.all([
      import("@polymarket/clob-client-v2"),
      import("viem"),
      import("viem/accounts"),
    ]);

  const host = (config.clobBaseUrl || "https://clob.polymarket.com").replace(
    /\/$/,
    "",
  );
  const chainId = config.chainId === 80002 ? Chain.AMOY : Chain.POLYGON;
  const account = privateKeyToAccount(normalizePrivateKey(config.privateKey!));
  const walletClient = createWalletClient({
    account,
    transport: http(),
  });

  const l1 = new ClobClient({
    host,
    chain: chainId,
    signer: walletClient,
    funderAddress: config.funderAddress,
    throwOnError: true,
  });
  const creds = await l1.createOrDeriveApiKey();
  const client = new ClobClient({
    host,
    chain: chainId,
    signer: walletClient,
    creds,
    funderAddress: config.funderAddress,
    throwOnError: true,
  });

  return { client: client as any, Side: Side as any, OrderType: OrderType as any };
}

export async function placeClobOrder(
  config: PolymarketServiceConfig,
  params: PlaceOrderParams,
): Promise<unknown> {
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
      ...(params.expiration ? { expiration: params.expiration } : {}),
    },
    { tickSize, negRisk },
    OrderType.GTC,
  );

  return response;
}

export async function cancelClobOrder(
  config: PolymarketServiceConfig,
  params: CancelOrderParams,
): Promise<unknown> {
  assertTradingReady(config);
  const orderId = params.orderId.trim();
  if (!orderId) throw new Error("orderId is required");

  const { client } = await createAuthenticatedClobClient(config);
  return client.cancelOrder({ orderID: orderId });
}
