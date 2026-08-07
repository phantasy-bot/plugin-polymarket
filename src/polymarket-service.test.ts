import { describe, expect, it, vi, afterEach } from "vitest";

import { PolymarketService } from "./polymarket-service.js";

describe("PolymarketService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes markets and filters by query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "1",
              question: "Will BTC hit 200k?",
              slug: "btc-200k",
              active: true,
              outcomePrices: '["0.4","0.6"]',
            },
            {
              id: "2",
              question: "Will it rain in NYC?",
              slug: "nyc-rain",
              active: true,
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    const service = new PolymarketService();
    const markets = await service.searchMarkets({ query: "btc", limit: 10 });
    expect(markets).toHaveLength(1);
    expect(markets[0]?.slug).toBe("btc-200k");
    expect(markets[0]?.outcomePrices).toEqual(["0.4", "0.6"]);
  });

  it("refuses trading without allowTrading", async () => {
    const service = new PolymarketService({ allowTrading: false });
    await expect(
      service.placeOrder({
        tokenId: "x",
        side: "buy",
        price: 0.5,
        size: 1,
      }),
    ).rejects.toThrow(/Trading disabled/);
  });
});
