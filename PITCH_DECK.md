# FlipDeck — Pitch Deck

*14 slides. Each slide has on-slide content (what the audience sees) and
speaker notes (what you say). Swap in real numbers where marked `[verify]`.*

---

## Slide 1 — Title

**FlipDeck**
*Buy low. Sell high. Every card, every market.*

The price-intelligence and trading cockpit for TCG flippers — Magic,
Riftbound, Yu-Gi-Oh!, Pokémon, and Lorcana in one place.

> **Notes:** One sentence: "FlipDeck tells card flippers what to buy and when
> to sell, and lets them act on it with one tap."

---

## Slide 2 — The problem

**Card flipping is a real market run with amateur tools.**

- Prices for the same card differ across TCGplayer, Cardmarket, eBay, and
  local marketplaces — and move daily on tournament results, bans, reprints,
  and hype.
- Serious flippers juggle 4+ browser tabs, spreadsheets, and Discord price
  bots. By the time they see a move, the window is gone.
- Inventory tracking (cost basis, condition, where a card physically is) lives
  in Excel, so nobody actually knows their P/L.

> **Notes:** The pain is speed and fragmentation. Every flipper has a story
> about the spike they saw six hours too late.

---

## Slide 3 — The moment

**The TCG market is bigger and faster than ever.**

- Collectible card market estimated in the **billions of dollars annually**,
  with Pokémon and Magic leading and Lorcana/Riftbound adding new collector
  waves. `[verify: latest market-size figure]`
- Riftbound (Riot, 2025) onboarded a huge gaming audience into paper cards
  overnight.
- Singles prices now move like small-cap stocks: event-driven, volatile,
  liquid enough to trade.

> **Notes:** New games are the wedge — Riftbound and Lorcana flippers have no
> entrenched tooling habit yet.

---

## Slide 4 — The solution

**A trading terminal for cards.**

1. **Track** — automatic price feeds for five games across major marketplaces,
   with history, deltas, spreads, and liquidity.
2. **Decide** — alert rules ("notify me if this drops 15% in 24h"; "flag any
   card where the TCGplayer→Cardmarket spread beats 20% after fees").
3. **Act** — push notification → one tap → **Approve** → prefilled buy or
   sell on the marketplace. Seconds, not tabs.

> **Notes:** The trio is the pitch: track, decide, act. Everyone else stops at
> "track."

---

## Slide 5 — Product: the cockpit

**Dashboard** *(show mockup: `mockups/dashboard.html`)*

- Portfolio value and unrealized P/L, live.
- Top movers across all five games with sparklines.
- Pending approvals surfaced front and center.

> **Notes:** Demo beat: "This user's Lorcana position is up 12% this week and
> FlipDeck is proposing they sell into the spike."

---

## Slide 6 — Product: inventory that knows its worth

**Inventory** *(show mockup: `mockups/inventory.html`)*

- Every card with condition, quantity, cost basis, live market value, and
  per-card P/L.
- Sort and filter by anything: game, set, condition, P/L, trend, tag.
- Bulk actions and CSV import for existing collections.

> **Notes:** The spreadsheet killer. Import your collection in one paste and
> it's marked-to-market forever after.

---

## Slide 7 — Product: one-click approvals

**Push → tap → done.** *(show mockups: `alerts-approvals.html`, `mobile-approval.html`)*

- A rule fires → FlipDeck builds a trade proposal with the price evidence and
  fee-adjusted net.
- Push notification hits your phone; one tap approves, one tap declines.
- Proposals expire in minutes because prices move — and show you afterward
  what approving would have earned.

> **Notes:** This is the retention feature. The "you missed $40" follow-up is
> what turns casual users into daily ones.

---

## Slide 8 — How it works

**Pipeline:** marketplace APIs → normalized price store → stat engine
(deltas, spreads, volatility, liquidity) → rule evaluator → notification +
proposal service → marketplace deep link / API execution.

- Hourly polling everywhere; 5-minute fast lane for cards with live rules.
- Provider adapters per game/marketplace — new sources drop in without
  touching product code.
- Where a marketplace allows programmatic orders we execute; where it
  doesn't, approval opens a prefilled listing/checkout. Compliant by design.

> **Notes:** Be upfront on the execution nuance — it builds trust with anyone
> who knows marketplace ToS. See TECH_NOTES.md for the risk register.

---

## Slide 9 — Who it's for

| Segment | Behavior | What they pay for |
|---|---|---|
| **Flippers / arbitragers** | Trade weekly, chase spreads | Speed: alerts + approvals |
| **Store owners & vendors** | Manage 10k+ card inventory | Bulk repricing intelligence |
| **Investor-collectors** | Buy and hold chase cards | Portfolio tracking, exit alerts |

> **Notes:** Lead with flippers (highest willingness to pay per feature
> shipped), expand to stores (bigger contracts) later.

---

## Slide 10 — Business model

**Freemium SaaS.**

- **Free:** 1 game, 25 tracked cards, daily price refresh, no push.
- **Flipper — $12/mo:** all games, 500 tracked cards, hourly refresh, push
  notifications, one-click approvals, CSV import.
- **Pro — $29/mo:** fast-lane refresh, unlimited tracking, spread scanner,
  API access, multi-marketplace fee profiles.
- Later: affiliate/referral fees on marketplace clickthroughs; B2B store tier.

> **Notes:** Comparable tools (sports-card trackers, sneaker bots) sustain
> $10–50/mo price points. `[verify comps]`

---

## Slide 11 — Competition

| | Price history | Multi-game | Inventory P/L | Alerts | **One-tap trade approvals** |
|---|---|---|---|---|---|
| TCGplayer | ✔ (own market) | partial | ✖ | ✖ | ✖ |
| MTGStocks / MTGGoldfish | ✔ | Magic only | partial | basic | ✖ |
| Collectr / hobby portfolio apps | ✔ | ✔ | ✔ | partial | ✖ |
| Spreadsheets + Discord bots | manual | ✔ | manual | noisy | ✖ |
| **FlipDeck** | ✔ | ✔ (5 games) | ✔ | rules-based | **✔** |

> **Notes:** The moat is the action layer plus cross-market spread data. Data
> alone is replicable; the act-on-it loop and its outcome history are not.

---

## Slide 12 — Go-to-market

1. **Launch where flippers already are:** TCG finance subreddits, Discord
   price-alert servers, YouTube "market watch" creators.
2. **Riftbound land-grab:** be the default price tool for the newest game
   before incumbents localize to it.
3. **Import-your-spreadsheet onboarding** — value visible in under 2 minutes.
4. Referral: give a month of Flipper tier for each converted invite.

> **Notes:** CAC hypothesis: content + community, not paid ads. Creators want
> spread data for videos — give it to them free with attribution.

---

## Slide 13 — Roadmap

- **Now (MVP):** 5 games, price tracking, inventory P/L, rules, push,
  one-click approvals via deep links.
- **+3 months:** spread scanner across marketplaces, fee profiles, sealed
  product tracking, mobile PWA polish.
- **+6 months:** native mobile apps, marketplace API execution where
  permitted, store/B2B tier, grading-premium data (PSA/BGS deltas).
- **+12 months:** more games (One Piece, Star Wars Unlimited, Gundam),
  ML price forecasting, social/copy-trading of top flippers' rules.

> **Notes:** Every roadmap line maps to a feature in FEATURES.md with an
> "improve me" note — this deck and the backlog stay in sync.

---

## Slide 14 — The ask

**[Choose one:]**

- *Bootstrap framing:* build MVP in [X] weeks with the attached build prompt;
  goal = 200 paying flippers in 90 days ≈ $2.4k MRR at the $12 tier.
- *Investor framing:* raising $[X] pre-seed for 12 months of runway — ship
  MVP, prove weekly-active flipping behavior, land the Riftbound wave.

**FlipDeck — the terminal for the card economy.**

> **Notes:** End on the demo: fire a live price alert on stage, approve it
> from the phone, show the marketplace order screen.
