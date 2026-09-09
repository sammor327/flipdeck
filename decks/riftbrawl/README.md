# Riftbrawl proposal deck

`Riftbrawl_Proposal.pptx` is a 9-slide event and prize-support proposal for
Riftbrawl, the Turn'em Sideways × anzidmtg 3v3v3v3 Riftbound team-brawl showcase.

Rebuild after editing `build.js`:

```bash
npm install pptxgenjs sharp react react-dom react-icons   # one-time, local to this folder
node build.js                                              # writes Riftbrawl_Proposal.pptx
```

Stats on slides 3–4 were pulled from public trackers (TwitchMetrics, TwitchTracker,
Liquipedia, playriftbound.com) in early September 2026. YouTube view counts for the
Riftbrawl Singapore VODs were not reachable and should be added from YouTube Studio.

## House style

Built in the Turn'em Sideways deck system (matches `TES_Deck_Refresh_07-2026-v2.pptx` in Drive):
16:9 at 10 × 5.625 in, Montserrat, dark textured background with the neon arrow border on
the left, yellow uppercase titles, lime / blue stat colors, highlighted label tags, gray
cards, italic footnotes, and the logo splash closer. Brand images live in `assets/`
(`bg.png`, `bg_closing.png`, `border_left.png`, `logo.png`), pulled from that deck.
