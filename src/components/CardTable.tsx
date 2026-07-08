"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { updateWatchTargets } from "@/app/actions/watchlist";
import { GAMES, marketplaceById } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import type { CardRow, ColKey } from "@/lib/cardRow";
import { InlineStatus, useActionStatus } from "./ActionStatus";
import { CardArt } from "./CardArt";
import { Delta } from "./Delta";
import { GameChip } from "./GameChip";
import { Sparkline } from "./Sparkline";
import { WatchButton } from "./WatchButton";

const LABEL: Record<ColKey, string> = {
  card: "Card",
  game: "Game",
  price: "Price",
  delta24h: "24h",
  delta7d: "7d",
  spread: "Spread*",
  spreadRoute: "Buy → Sell",
  liquidity: "Liquidity",
  spark: "7d trend",
  targetBuy: "Target buy",
  targetSell: "Target sell",
  notes: "Notes",
  action: "",
  watch: "",
};
const NUM = new Set<ColKey>(["price", "delta24h", "delta7d", "spread", "liquidity", "targetBuy", "targetSell"]);
const SORTABLE = new Set<ColKey>(["card", "game", "price", "delta24h", "delta7d", "spread", "liquidity", "targetBuy", "targetSell"]);

function sortVal(r: CardRow, k: ColKey): string | number | null {
  switch (k) {
    case "card": return r.name;
    case "game": return r.gameName;
    case "price": return r.price ?? null;
    case "delta24h": return r.delta24hPct ?? null;
    case "delta7d": return r.delta7dPct ?? null;
    case "spread": return r.bestSpreadPct ?? null;
    case "liquidity": return r.liquidityScore ?? null;
    case "targetBuy": return r.targetBuyPrice ?? null;
    case "targetSell": return r.targetSellPrice ?? null;
    default: return null;
  }
}

export function CardTable({
  rows,
  columns,
  initialSort = "card",
  initialDir = -1,
  emptyText = "Nothing here yet.",
  gameFilter = true,
  actionLabel,
  editableTargets = false,
}: {
  rows: CardRow[];
  columns: ColKey[];
  initialSort?: ColKey;
  initialDir?: 1 | -1;
  emptyText?: string;
  gameFilter?: boolean;
  actionLabel?: string;
  /** Watchlist only: target buy/sell cells become click-to-edit inputs. */
  editableTargets?: boolean;
}) {
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>({ key: initialSort, dir: initialDir });

  const gamesPresent = useMemo(() => GAMES.filter((g) => rows.some((r) => r.gameSlug === g.slug)), [rows]);

  const view = useMemo(() => {
    const filtered = rows.filter((r) => game === "all" || r.gameSlug === game);
    return [...filtered].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      return (Number(av) - Number(bv)) * sort.dir;
    });
  }, [rows, game, sort]);

  const toggle = (k: ColKey) => {
    if (!SORTABLE.has(k)) return;
    setSort((s) => (s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key: k, dir: -1 }));
  };
  const arrow = (k: ColKey) => (sort.key === k ? (sort.dir === -1 ? "↓" : "↑") : "↕");

  return (
    <div>
      {gameFilter && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <button className={`fchip ${game === "all" ? "on" : ""}`} onClick={() => setGame("all")}>
            All games
          </button>
          {gamesPresent.map((g) => (
            <button key={g.slug} className={`fchip ${game === g.slug ? "on" : ""}`} onClick={() => setGame(g.slug)}>
              <span className={`dot g-${g.slug}`} /> {g.name}
            </button>
          ))}
        </div>
      )}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {view.length === 0 ? (
            <div className="hint" style={{ padding: 20 }}>
              {emptyText}
            </div>
          ) : (
            <table style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const cls = `${NUM.has(c) ? "num " : ""}${SORTABLE.has(c) ? "sortable" : ""}`.trim() || undefined;
                    if (SORTABLE.has(c)) {
                      return (
                        <th
                          key={c}
                          className={cls}
                          tabIndex={0}
                          role="button"
                          aria-sort={sort.key === c ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
                          onClick={() => toggle(c)}
                          onKeyDown={(e: KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggle(c);
                            }
                          }}
                        >
                          {LABEL[c]} {arrow(c)}
                        </th>
                      );
                    }
                    return (
                      <th key={c} className={cls} style={c === "spark" ? { textAlign: "center" } : undefined}>
                        {LABEL[c]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.cardId}>
                    {columns.map((c) => (
                      <Cell key={c} col={c} row={r} actionLabel={actionLabel} editableTargets={editableTargets} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ col, row, actionLabel, editableTargets }: { col: ColKey; row: CardRow; actionLabel?: string; editableTargets?: boolean }) {
  switch (col) {
    case "card":
      return (
        <td>
          <Link href={`/cards/${row.cardId}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CardArt name={row.name} gameSlug={row.gameSlug} setCode={row.setCode} rarity={row.rarity} imageUrl={row.imageUrl} size="thumb" />
            <span>
              <span className="cname" style={{ display: "block" }}>
                {row.name}
              </span>
              <span className="cset">
                {row.setCode} · {row.rarity}
              </span>
            </span>
          </Link>
        </td>
      );
    case "game":
      return (
        <td>
          <GameChip slug={row.gameSlug} showBeta={false} />
        </td>
      );
    case "price":
      return <td className="num">{row.price != null ? formatMoney(row.price) : "—"}</td>;
    case "delta24h":
      return (
        <td className="num">
          <Delta value={row.delta24hPct} kind="percent" />
        </td>
      );
    case "delta7d":
      return (
        <td className="num">
          <Delta value={row.delta7dPct} kind="percent" />
        </td>
      );
    case "spread":
      return (
        <td className="num">
          <Delta value={row.bestSpreadPct} kind="percent" />
        </td>
      );
    case "spreadRoute":
      return (
        <td className="cset">
          {row.bestSpreadBuy ? marketplaceById(row.bestSpreadBuy)?.name : "—"} → {row.bestSpreadSell ? marketplaceById(row.bestSpreadSell)?.name : "—"}
        </td>
      );
    case "liquidity":
      return <td className="num">{row.liquidityScore != null ? `${row.liquidityScore}/100` : "—"}</td>;
    case "spark":
      return (
        <td style={{ textAlign: "center" }}>
          <Sparkline points={row.spark ?? []} label={`${row.name} 7-day trend`} />
        </td>
      );
    case "targetBuy":
      if (editableTargets) {
        return (
          <td className="num">
            <TargetCell row={row} field="targetBuyPrice" label={`Target buy price for ${row.name}`} />
          </td>
        );
      }
      return <td className="num">{row.targetBuyPrice != null ? formatMoney(row.targetBuyPrice) : "—"}</td>;
    case "targetSell":
      if (editableTargets) {
        return (
          <td className="num">
            <TargetCell row={row} field="targetSellPrice" label={`Target sell price for ${row.name}`} />
          </td>
        );
      }
      return <td className="num">{row.targetSellPrice != null ? formatMoney(row.targetSellPrice) : "—"}</td>;
    case "notes":
      return (
        <td className="cset" style={{ whiteSpace: "normal", maxWidth: 240 }}>
          {row.notes ?? ""}
        </td>
      );
    case "action":
      return (
        <td className="num">
          <Link className={`btn sm ${row.owned ? "pri" : "ghost"}`} href={`/cards/${row.cardId}`}>
            {actionLabel ?? (row.owned ? "Sell" : "View")}
          </Link>
        </td>
      );
    case "watch":
      return (
        <td className="num">
          <WatchButton cardId={row.cardId} initialWatched />
        </td>
      );
    default:
      return <td />;
  }
}

/**
 * Click-to-edit target price (watchlist). Enter/blur saves via the server
 * action, Escape cancels, and an empty input clears the target.
 */
function TargetCell({ row, field, label }: { row: CardRow; field: "targetBuyPrice" | "targetSellPrice"; label: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { status, flash, clear } = useActionStatus();
  const cancelRef = useRef(false);
  const value = field === "targetBuyPrice" ? row.targetBuyPrice : row.targetSellPrice;

  const save = (raw: string) => {
    setEditing(false);
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : parseFloat(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if (next === (value ?? null)) return; // unchanged
    const patch = field === "targetBuyPrice" ? { targetBuyPrice: next } : { targetSellPrice: next };
    startTransition(async () => {
      const res: { ok: boolean; error?: string } = await updateWatchTargets(row.cardId, patch);
      if (res.ok) {
        clear();
        router.refresh();
      } else {
        flash("error", res.error ?? "Update failed");
      }
    });
  };

  return (
    <>
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          step="0.01"
          defaultValue={value ?? ""}
          aria-label={label}
          style={{ width: 96 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur(); // save via onBlur
            } else if (e.key === "Escape") {
              cancelRef.current = true;
              setEditing(false);
            }
          }}
          onBlur={(e) => {
            if (cancelRef.current) {
              cancelRef.current = false;
              return;
            }
            save(e.currentTarget.value);
          }}
        />
      ) : (
        <button
          className="btn sm ghost"
          onClick={() => {
            cancelRef.current = false; // a stale Escape must not swallow the next save
            setEditing(true);
          }}
          disabled={pending}
          aria-label={label}
        >
          {value != null ? formatMoney(value) : "Set"}
        </button>
      )}
      <div style={{ whiteSpace: "normal" }}>
        <InlineStatus status={status} />
      </div>
    </>
  );
}
