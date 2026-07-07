"use client";

import { useState } from "react";
import { GAMES, gameBySlug } from "@/lib/constants";
import { HEADLINES, HEADLINE_TAG_META } from "@/lib/headlines";
import { daysUntil, RELEASE_TYPE_META, RELEASES, relativeDay } from "@/lib/releases";

export function ReleasesView() {
  const [game, setGame] = useState("all");
  const matches = (g: string) => game === "all" || g === game || g === "all";

  const upcoming = [...RELEASES].sort((a, b) => a.date.localeCompare(b.date)).filter((r) => matches(r.game));
  const news = [...HEADLINES].sort((a, b) => b.date.localeCompare(a.date)).filter((h) => matches(h.game));

  return (
    <>
      <div className="filters" style={{ marginBottom: 14 }}>
        <button className={`fchip ${game === "all" ? "on" : ""}`} onClick={() => setGame("all")}>
          All games
        </button>
        {GAMES.map((g) => (
          <button key={g.slug} className={`fchip ${game === g.slug ? "on" : ""}`} onClick={() => setGame(g.slug)}>
            <span className={`dot g-${g.slug}`} /> {g.name}
          </button>
        ))}
      </div>

      <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <div className="panel">
          <h2>Upcoming releases &amp; rotations</h2>
          <div className="hint" style={{ marginBottom: 6 }}>
            When the market shifts and cards leave rotation.
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {upcoming.map((r) => {
              const meta = RELEASE_TYPE_META[r.type];
              const d = daysUntil(r.date);
              const soon = d >= 0 && d <= 14;
              return (
                <div key={r.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--grid)" }}>
                  <span className="fic" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                    <div className="hint">
                      {r.game === "all" ? "All games" : gameBySlug(r.game)?.name} · {meta.label}
                    </div>
                    <div className="hint" style={{ marginTop: 2 }}>
                      {r.note}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: soon ? "var(--warn)" : "var(--ink-2)" }}>{relativeDay(r.date)}</div>
                    <div className="hint">{new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                  </div>
                </div>
              );
            })}
            {upcoming.length === 0 ? <div className="hint" style={{ padding: 12 }}>No events for this game.</div> : null}
          </div>
        </div>

        <div className="panel">
          <h2>Community headlines</h2>
          <div className="hint" style={{ marginBottom: 6 }}>
            Why prices are moving — news, spoilers, and FlipDeck signals.
          </div>
          <ul className="feed">
            {news.map((h) => {
              const meta = HEADLINE_TAG_META[h.tag];
              return (
                <li key={h.id}>
                  <span className="fic" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="ft">
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.title}</div>
                    <div className="hint" style={{ margin: "2px 0" }}>
                      {h.summary}
                    </div>
                    <div className="t">
                      {h.source} · {h.game === "all" ? "All games" : gameBySlug(h.game)?.name} · {meta.label} · {relativeDay(h.date)}
                    </div>
                  </div>
                </li>
              );
            })}
            {news.length === 0 ? <div className="hint" style={{ padding: 12 }}>No headlines for this game.</div> : null}
          </ul>
        </div>
      </div>
    </>
  );
}
