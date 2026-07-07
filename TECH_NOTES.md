# FlipDeck — Technical Notes

Supporting detail for the build prompt: where the price data comes from, how
the pipeline fits together, what could get you in trouble, and how the money
math works. Verify API availability before building — this space changes fast.

## Price data sources per game

| Game | Primary source | Notes |
|---|---|---|
| Magic: The Gathering | **Scryfall API** (free) | Ships TCGplayer + Cardmarket prices per printing; excellent card catalog with images. Rate limit ~10 req/s; bulk data files daily. |
| Pokémon TCG | **Pokémon TCG API** (pokemontcg.io) + TCGplayer | pokemontcg.io includes TCGplayer price blocks; key required, generous free tier. |
| Yu-Gi-Oh! | **YGOPRODeck API** (free) | Card DB + TCGplayer/Cardmarket/eBay average prices. Bulk endpoint available. |
| Disney Lorcana | TCGplayer category; community APIs (e.g. **Lorcast**) | Younger data ecosystem; verify coverage of Enchanted/foil printings. |
| Riftbound | TCGplayer category (verify); community sources | Newest game — expect the thinnest data. Ship behind a "beta data" badge; the mock provider covers dev. |
| Cross-game sales comps | **eBay APIs** (sold listings), PriceCharting | Sold-price data is the ground truth for "can I actually exit at this price"; eBay API access requires an approved developer account. |

**Rule of thumb:** listing prices tell you the ask; **sold prices tell you the
truth.** Show both when you have both, and label which is which.

## Architecture sketch

```
[Provider adapters]──┐   (Scryfall, pokemontcg.io, YGOPRODeck, TCGplayer, eBay, mock)
                     ▼
              [Ingest worker]───► PricePoint store (Postgres, append-only)
               hourly + 5-min             │
               fast lane                  ▼
                                   [Stat engine]  deltas / spreads / volatility / liquidity
                                          │
                                          ▼
                                   [Rule evaluator]──► TradeProposal + NotificationLog
                                          │                    │
                                          ▼                    ▼
                                   [Push service]        [Approvals UI]
                                    (Web Push → FCM/APNs later)   │
                                                                  ▼
                                                     [Execution layer, per-marketplace]
                                                      deep-link mode │ API mode (where permitted)
```

Key decisions embedded in that sketch:

- **Append-only price history.** Storage is cheap; the history *is* the moat
  (forecasting, rule attribution, "you missed $40" hindsight all need it).
- **Stat engine is derived + cached**, recomputed on ingest — rules evaluate
  against precomputed stats, so the evaluator stays O(rules), not O(rules ×
  history).
- **Execution is a per-marketplace strategy object** with two modes
  (deep-link / API). Compliance posture lives in code, per adapter, and is
  visible in the UI ("opens TCGplayer" vs "places order").

## The alert → approval pipeline (timing matters)

1. Ingest writes new `PricePoint`s → stat engine updates `MarketStat`.
2. Rule evaluator runs on changed cards only (Redis set of dirty card ids).
3. Fired rule → create `TradeProposal` (status `pending`, `expires_at` now+30m)
   → enqueue push.
4. Push payload: card, side, price, net-after-fees, expiry countdown, deep
   link to the focused approval screen.
5. Approve → execution layer acts → status `executed` (or `approved` +
   outbound deep link) → log outcome. Decline/timeout → record, and at expiry
   snapshot the price for hindsight display.
6. Cooldown per rule (default 6h) so a volatile card doesn't spam.

**Latency budget:** price captured → push delivered in **< 60s** on the fast
lane. That number is the product; measure it from day one.

## Risks & compliance (read before building the execution layer)

1. **Marketplace ToS on automation.** Most card marketplaces (TCGplayer,
   Cardmarket, eBay) restrict scraping and automated purchasing. Using
   official APIs within their terms is fine; headless-browser auto-buying is
   a ban risk for you *and your users*. This is why the execution layer's
   default mode is a **prefilled deep link with a human tap** — the human
   stays in the loop and the approval is genuinely the user's action.
2. **Price data licensing.** Scryfall/YGOPRODeck are free with attribution
   requirements; TCGplayer/eBay APIs have partner terms about caching and
   redistribution. Don't resell raw feeds; sell the intelligence on top.
3. **Not financial advice.** Forecasts and proposals need clear "informational
   only" framing; avoid language promising returns.
4. **Rate limits & IP hygiene.** Centralize polling server-side (never from
   user browsers), cache bulk files, and back off on 429s — burning a data
   source is an outage.
5. **Riftbound trademark caution.** Riot IP; use official card names/images
   per their fan-content policy, same as Wizards/Konami/TPCi/Disney policies
   for the others. Card images have per-publisher usage rules — link or use
   sanctioned image CDNs (e.g. Scryfall's) rather than rehosting where terms
   are unclear.

## Monetization math (sanity check)

- Flipper tier $12/mo. Infra per active user ≈ pennies (polling is shared
  across users tracking the same cards — cost scales with distinct cards, not
  users). Gross margin is software-typical (>85%).
- 200 paying users ≈ $2.4k MRR — a realistic 90-day bootstrap goal via
  community launch; 2,000 ≈ $24k MRR, roughly ramen-profitable for a small
  team.
- Affiliate upside: TCGplayer and eBay both run affiliate programs; an
  approval that deep-links a purchase is a natural affiliate event —
  disclose it in-app.

## Nice-to-haves worth an early spike

- **Sales-velocity estimation** from listing-count deltas (a listing that
  disappears ≈ a sale ≈ liquidity signal).
- **Event calendar ingestion** (ban lists, set releases, tournament results)
  to annotate charts and explain moves.
- **Rule backtesting** against stored history before a user enables a rule —
  "this rule would have fired 7 times last month, netting +$118."
