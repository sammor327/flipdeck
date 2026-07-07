# FlipDeck — TCG Price Arbitrage Platform

> **Buy low. Sell high. Every card, every market.**

A concept package for a web app that automatically tracks card prices across
**Magic: The Gathering, Riftbound, Yu-Gi-Oh!, Pokémon, and Disney Lorcana**, and is
built for flippers: people who want to buy low and sell high quickly, with
sortable inventories, push notifications, and one-click buy/sell approvals
driven by moving prices.

## What's in this package

| File | Purpose |
|---|---|
| [`BUILD_PROMPT.md`](BUILD_PROMPT.md) | A complete, copy-paste prompt for Claude (Code or Design) to build the app. Includes data model, pages, and acceptance criteria. |
| [`PITCH_DECK.md`](PITCH_DECK.md) | A 14-slide pitch deck with speaker notes — problem, solution, market, product, business model, roadmap, ask. |
| [`FEATURES.md`](FEATURES.md) | The full feature list, split into MVP / v1.1 / v2, with explicit "improve me" notes and open product questions. |
| [`TECH_NOTES.md`](TECH_NOTES.md) | Price-data sources per game, architecture sketch, alerting pipeline, legal/ToS risks, and monetization math. |
| [`mockups/`](mockups/) | Five self-contained HTML page layouts to upload to Claude Design for visual tweaking (no build step, no external assets). |

## The mockups

Each file is a single, dependency-free HTML page (inline CSS/SVG, dark trading
theme). Open them in a browser or upload them straight to Claude Design.

| File | Screen |
|---|---|
| `mockups/dashboard.html` | Home dashboard — portfolio value chart, stat tiles, top movers, pending approvals |
| `mockups/inventory.html` | Inventory manager — sortable/filterable holdings with cost basis and P/L |
| `mockups/card-detail.html` | Card detail — price history, cross-marketplace comparison, alert rule builder |
| `mockups/alerts-approvals.html` | Alerts & approvals — notification feed and one-click buy/sell approval queue |
| `mockups/mobile-approval.html` | Mobile push-notification flow — the one-tap approval screen (phone width) |

## Suggested workflow

1. Read `PITCH_DECK.md` to align on the story, then trim `FEATURES.md` to the MVP you actually want.
2. Upload the mockups to Claude Design and iterate on look and feel.
3. Paste `BUILD_PROMPT.md` (plus your tweaked mockups) into Claude Code and build.
4. Read the **Risks & compliance** section of `TECH_NOTES.md` before wiring any automated buying — marketplace terms of service matter.
