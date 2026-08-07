# Polymarket

Polymarket prediction-market integration for Phantasy companions.

Package: `@phantasy/plugin-polymarket`  
Repo: https://github.com/phantasy-bot/plugin-polymarket

## Capabilities

| Surface | Status |
| --- | --- |
| Search markets (Gamma) | Ready |
| Market detail | Ready |
| CLOB order book / midpoint / price | Ready |
| Signed order placement | Gated scaffold (`allowTrading` + private key) |

## Tools

- `polymarket_search_markets`
- `polymarket_get_market`
- `polymarket_get_orderbook`
- `polymarket_get_price`
- `polymarket_status`

## Config

```json
{
  "enabled": true,
  "gammaBaseUrl": "https://gamma-api.polymarket.com",
  "clobBaseUrl": "https://clob.polymarket.com",
  "allowTrading": false
}
```

Env aliases: `POLYMARKET_GAMMA_URL`, `POLYMARKET_CLOB_URL`, `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_ALLOW_TRADING`.

## Install

```bash
phantasy extensions install plugin polymarket
# or
git clone https://github.com/phantasy-bot/plugin-polymarket.git .phantasy/plugins/polymarket
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Uses public `@phantasy/agent/plugins` + `@phantasy/agent/plugin-runtime` only.

## Allow trading (Admin UI)

1. Open **Admin → Plugins** (or **Business → Kalshi/Polymarket** tab).
2. Toggle **Allow trading** on or off.
3. Click **Save**.

Plugin form values override env defaults. No restart required.
