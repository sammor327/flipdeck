"use client";

import { Fragment, type KeyboardEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONDITIONS, GAMES, MARKETPLACES, type Condition, type FeeProfile, type Marketplace } from "@/lib/constants";
import { netProceeds } from "@/lib/fees";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/math";
import type { InventoryRow } from "@/lib/queries";
import {
  addInventoryItem,
  bulkAddTag,
  bulkDelete,
  bulkList,
  importInventoryCsv,
  listInventoryItem,
  sellInventoryItem,
  unlistInventoryItem,
  updateInventoryItem,
} from "@/app/actions/inventory";
import { CardArt } from "./CardArt";
import { Delta } from "./Delta";
import { GameChip } from "./GameChip";
import { Sparkline } from "./Sparkline";
import { EmptyState } from "./states";

export interface CatalogEntry {
  id: string;
  name: string;
  setName: string;
  setCode: string;
  gameSlug: string;
}

type SortKey = "name" | "game" | "condition" | "quantity" | "costBasis" | "marketPrice" | "unrealizedPL" | "unrealizedPct" | "delta24hPct";

type PanelKind = "sell" | "list" | "edit";

type BulkMode = "list" | "tag" | "delete";

function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function InventoryTable({
  rows,
  catalog,
  initialQuery = "",
  feeProfiles,
}: {
  rows: InventoryRow[];
  catalog: CatalogEntry[];
  initialQuery?: string;
  feeProfiles: Record<Marketplace, FeeProfile>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [game, setGame] = useState<string>("all");
  const [condition, setCondition] = useState<string>("any");
  const [pl, setPl] = useState<string>("any");
  const [status, setStatus] = useState<string>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "unrealizedPct", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ rowId: string; kind: PanelKind } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Inline mini-form state for the bulk bar. Replaces the old window.prompt
  // flows: which action is being confirmed, its input value, and any server
  // error to surface right where the user acted.
  const [bulkMode, setBulkMode] = useState<BulkMode | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);
  const [tagFilter, setTagFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (game !== "all" && r.gameSlug !== game) return false;
      if (condition !== "any" && r.condition !== condition) return false;
      if (status === "active" ? r.status === "sold" : status !== "all" && r.status !== status) return false;
      const effectivePL = r.status === "sold" ? r.realizedPL ?? 0 : r.unrealizedPL;
      if (pl === "winners" && effectivePL <= 0) return false;
      if (pl === "losers" && effectivePL >= 0) return false;
      if (tagFilter !== "all" && !r.tags.includes(tagFilter)) return false;
      if (query && !fuzzy(query, `${r.name} ${r.setName} ${r.setCode} ${r.tags.join(" ")}`)) return false;
      return true;
    });
    out.sort((a, b) => {
      const dir = sort.dir;
      // "game" sorts by display name; "unrealizedPL" sorts by what the P/L $ cell
      // shows (realized P/L for sold rows); every other SortKey is a real InventoryRow field.
      const sortVal = (r: InventoryRow): string | number | null => {
        if (sort.key === "game") return r.gameName;
        if (sort.key === "unrealizedPL") return r.status === "sold" ? r.realizedPL : r.unrealizedPL;
        return r[sort.key];
      };
      const av = sortVal(a);
      const bv = sortVal(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      return (Number(av) - Number(bv)) * dir;
    });
    return out;
  }, [rows, game, condition, status, pl, tagFilter, query, sort]);

  const totals = useMemo(() => {
    // Qty/cost/market keep "active holdings" semantics — sold rows add nothing
    // there, only their realized P/L into the P/L $ total.
    let qty = 0;
    let cost = 0;
    let market = 0;
    let realized = 0;
    for (const r of filtered) {
      if (r.status === "sold") {
        realized += r.realizedPL ?? 0;
        continue;
      }
      qty += r.quantity;
      cost += r.costBasis * r.quantity;
      market += r.marketValue;
    }
    const pl$ = market - cost + realized;
    return { qty, cost, market, pl$, plPct: cost > 0 ? ((market - cost) / cost) * 100 : null };
  }, [filtered]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? "↓" : "↑") : "↕");
  const sortableProps = (key: SortKey, extraClass = "") => ({
    className: `${extraClass} sortable`.trim(),
    tabIndex: 0,
    role: "button" as const,
    "aria-sort": (sort.key === key ? (sort.dir === -1 ? "descending" : "ascending") : "none") as
      | "descending"
      | "ascending"
      | "none",
    onClick: () => toggleSort(key),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSort(key);
      }
    },
  });

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  // Sold rows are read-only history: never selectable, never bulk-actionable.
  const selectable = filtered.filter((r) => r.status !== "sold");
  const soldIds = useMemo(() => new Set(rows.filter((r) => r.status === "sold").map((r) => r.id)), [rows]);
  const withoutSold = (ids: string[]) => ids.filter((id) => !soldIds.has(id));
  const allVisibleSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      if (allVisibleSelected) return new Set();
      return new Set(selectable.map((r) => r.id));
    });

  // What the selection is worth right now, shown next to "N selected". Rows
  // without a live market price fall back to cost so the total never reads $0
  // for cards that simply haven't priced yet.
  const selectedValue = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      sum += r.marketPrice != null ? r.marketValue : r.costBasis * r.quantity;
    }
    return sum;
  }, [rows, selected]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setBulkMsg(res.error ?? "Something went wrong");
      router.refresh();
    });

  const openBulkMode = (mode: BulkMode) => {
    setBulkError(null);
    setBulkMsg(null);
    if (mode === "list") setBulkPrice("");
    if (mode === "tag") setBulkTag("");
    setBulkMode(mode);
  };
  const closeBulkMode = () => {
    setBulkMode(null);
    setBulkError(null);
  };

  // Mirrors bulkList's isValidPrice guard so Confirm disables before the
  // server would reject anyway.
  const parsedBulkPrice = parseFloat(bulkPrice);
  const bulkPriceValid = Number.isFinite(parsedBulkPrice) && parsedBulkPrice > 0;
  const bulkTagValid = bulkTag.trim().length > 0;
  const actionableCount = withoutSold([...selected]).length;

  const runBulk = (
    label: (count: number) => string,
    fn: (ids: string[]) => Promise<{ ok: boolean; error?: string; count?: number }>
  ) => {
    const ids = withoutSold([...selected]);
    // A status-filter change can leave only sold rows selected; don't call the
    // action with nothing actionable.
    if (ids.length === 0) {
      setBulkError("Only sold cards are selected — nothing to change.");
      return;
    }
    startTransition(async () => {
      const res = await fn(ids);
      if (!res.ok) {
        setBulkError(res.error ?? "Something went wrong");
        return;
      }
      setSelected(new Set());
      closeBulkMode();
      setBulkMsg(label(res.count ?? ids.length));
      router.refresh();
    });
  };

  const confirmBulk = () => {
    if (pending) return;
    if (bulkMode === "list" && bulkPriceValid) {
      runBulk((n) => `Listed ${n} card${n === 1 ? "" : "s"}.`, (ids) => bulkList(ids, parsedBulkPrice));
    } else if (bulkMode === "tag" && bulkTagValid) {
      runBulk((n) => `Tagged ${n} card${n === 1 ? "" : "s"}.`, (ids) => bulkAddTag(ids, bulkTag.trim()));
    } else if (bulkMode === "delete") {
      runBulk((n) => `Deleted ${n} card${n === 1 ? "" : "s"}.`, (ids) => bulkDelete(ids));
    }
  };

  const bulkInputKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmBulk();
    } else if (e.key === "Escape") {
      // Cancel just the mini-form — never let Escape bubble up and clear the
      // selection the user built.
      e.preventDefault();
      e.stopPropagation();
      closeBulkMode();
    }
  };

  const openPanel = (r: InventoryRow, kind: PanelKind) => setPanel({ rowId: r.id, kind });

  const onImport = async (file: File) => {
    const text = await file.text();
    startTransition(async () => {
      const res = await importInventoryCsv(text);
      setImportMsg(res.ok ? `Imported ${res.added} card(s)${res.skipped.length ? `, skipped ${res.skipped.length} unmatched` : ""}.` : res.error ?? "Import failed");
      router.refresh();
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="headrow" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          className="search"
          type="search"
          placeholder="Search by name, set, tag… (fuzzy)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search inventory"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={pending}>
          Import CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <a className="btn ghost" href="/api/export">
          Export
        </a>
        <button className="btn pri" onClick={() => setShowAdd((v) => !v)}>
          + Add cards
        </button>
      </div>

      {importMsg ? (
        <div className="bulk" style={{ marginBottom: 12 }}>
          {importMsg}
          <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setImportMsg(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {showAdd ? <AddCardForm catalog={catalog} onDone={() => setShowAdd(false)} /> : null}

      {/* Filters */}
      <div className="filters" style={{ marginBottom: 12 }}>
        <button className={`fchip ${game === "all" ? "on" : ""}`} onClick={() => setGame("all")}>
          All games
        </button>
        {GAMES.map((g) => (
          <button key={g.slug} className={`fchip ${game === g.slug ? "on" : ""}`} onClick={() => setGame(g.slug)}>
            <span className={`dot g-${g.slug}`} /> {g.name}
          </button>
        ))}
        <select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Condition filter">
          <option value="any">Condition: Any</option>
          {CONDITIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <select value={pl} onChange={(e) => setPl(e.target.value)} aria-label="P/L filter">
          <option value="any">P/L: Any</option>
          <option value="winners">Winners only</option>
          <option value="losers">Losers only</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="active">Status: Active</option>
          <option value="owned">Owned</option>
          <option value="listed">Listed</option>
          <option value="sold">Sold</option>
          <option value="all">All</option>
        </select>
        {allTags.length > 0 ? (
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag filter">
            <option value="all">Tag: Any</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {bulkMsg ? (
        <div className="bulk" style={{ marginBottom: 12 }} role="status">
          {bulkMsg}
          <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setBulkMsg(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div className="bulk" style={{ marginBottom: 12 }}>
          <b>{selected.size} selected</b>
          <span className="hint">{formatMoney(selectedValue)} market value</span>
          {bulkMode === null ? (
            <>
              <button className="btn sm" onClick={() => openBulkMode("list")} disabled={pending}>
                List for sale
              </button>
              <button className="btn sm ghost" onClick={() => openBulkMode("tag")} disabled={pending}>
                Add tag
              </button>
              <button className="btn sm ghost" onClick={() => openBulkMode("delete")} disabled={pending}>
                Delete
              </button>
              <button
                className="btn sm ghost"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setSelected(new Set());
                  closeBulkMode();
                }}
              >
                Clear
              </button>
            </>
          ) : bulkMode === "list" ? (
            <>
              <label className="hint" htmlFor="bulk-list-price">
                Price / unit
              </label>
              <input
                id="bulk-list-price"
                autoFocus
                type="number"
                min={0}
                step="0.01"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                onKeyDown={bulkInputKeys}
                style={{ width: 110 }}
              />
              <button className="btn sm pri" onClick={confirmBulk} disabled={pending || !bulkPriceValid}>
                Confirm
              </button>
              <button className="btn sm ghost" onClick={closeBulkMode} disabled={pending}>
                Cancel
              </button>
            </>
          ) : bulkMode === "tag" ? (
            <>
              <label className="hint" htmlFor="bulk-tag">
                Tag
              </label>
              <input
                id="bulk-tag"
                autoFocus
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                onKeyDown={bulkInputKeys}
                placeholder="binder-A"
                style={{ width: 140 }}
              />
              <button className="btn sm pri" onClick={confirmBulk} disabled={pending || !bulkTagValid}>
                Confirm
              </button>
              <button className="btn sm ghost" onClick={closeBulkMode} disabled={pending}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <b>
                Delete {actionableCount} card{actionableCount === 1 ? "" : "s"}?
              </b>
              <button
                className="btn sm"
                style={{ background: "var(--bad)", borderColor: "var(--bad)", color: "#fff" }}
                onClick={confirmBulk}
                disabled={pending}
              >
                Confirm delete
              </button>
              <button className="btn sm ghost" onClick={closeBulkMode} disabled={pending}>
                Cancel
              </button>
            </>
          )}
          {bulkError ? (
            <span className="down" role="alert">
              {bulkError}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {rows.length === 0 ? (
            // First run: the inventory itself is empty, not just filtered to
            // nothing — onboard instead of suggesting filter tweaks.
            <div style={{ padding: 20 }}>
              <EmptyState
                icon="🃏"
                title="No cards yet"
                hint="Add your first card or import a CSV to start tracking value and P/L."
                action={
                  <>
                    <button className="btn pri" onClick={() => setShowAdd(true)}>
                      + Add cards
                    </button>{" "}
                    <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                      Import CSV
                    </button>
                  </>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20 }}>
              <EmptyState icon="🔍" title="No cards match" hint="Try clearing filters or your search." />
            </div>
          ) : (
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible" />
                  </th>
                  <th {...sortableProps("name")}>
                    Card <span className="hint">{arrow("name")}</span>
                  </th>
                  <th {...sortableProps("game")}>Game {arrow("game")}</th>
                  <th {...sortableProps("condition")}>Cond {arrow("condition")}</th>
                  <th {...sortableProps("quantity", "num")}>Qty {arrow("quantity")}</th>
                  <th {...sortableProps("costBasis", "num")}>Cost basis {arrow("costBasis")}</th>
                  <th {...sortableProps("marketPrice", "num")}>Market {arrow("marketPrice")}</th>
                  <th {...sortableProps("unrealizedPL", "num")}>P/L $ {arrow("unrealizedPL")}</th>
                  <th {...sortableProps("unrealizedPct", "num")}>P/L % {arrow("unrealizedPct")}</th>
                  <th style={{ textAlign: "center" }}>7d</th>
                  <th>Tags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <Fragment key={r.id}>
                  <tr>
                    <td>
                      {r.status === "sold" ? null : (
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`Select ${r.name}`} />
                      )}
                    </td>
                    <td>
                      <Link href={`/cards/${r.cardId}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <CardArt name={r.name} gameSlug={r.gameSlug} setCode={r.setCode} rarity={r.rarity} imageUrl={r.imageUrl} size="thumb" />
                        <span>
                          <span className="cname" style={{ display: "block" }}>
                            {r.name}
                          </span>
                          <span className="cset">
                            {r.setCode} · {r.rarity} · #{r.collectorNumber}
                            {r.status === "listed" && r.listedPrice ? ` · Listed ${formatMoney(r.listedPrice)}` : ""}
                            {r.status === "sold" && r.soldPrice != null ? ` · Sold ${formatMoney(r.soldPrice)}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <GameChip slug={r.gameSlug} showBeta={false} />
                    </td>
                    <td>
                      <span className="cond">{r.condition}</span>
                    </td>
                    <td className="num">{r.quantity}</td>
                    <td className="num">{formatMoney(r.costBasis)}</td>
                    <td className="num">{r.marketPrice != null ? formatMoney(r.marketPrice) : "—"}</td>
                    <td className="num">
                      <Delta value={r.status === "sold" ? r.realizedPL : r.unrealizedPL} kind="money" />
                    </td>
                    <td className="num">
                      <Delta value={r.unrealizedPct} kind="percent" />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <Sparkline points={r.spark} label={`${r.name} 7-day trend`} />
                    </td>
                    <td>
                      {r.tags.map((t) => (
                        <span className="tag" key={t} style={{ marginRight: 4 }}>
                          {t}
                        </span>
                      ))}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {r.status === "sold" ? (
                        <span className="hint">Sold</span>
                      ) : (
                        <>
                          {r.status === "listed" ? (
                            <button className="btn sm ghost" onClick={() => openPanel(r, "sell")} disabled={pending}>
                              Sell
                            </button>
                          ) : (
                            <button className="btn sm pri" onClick={() => openPanel(r, "sell")} disabled={pending}>
                              Sell
                            </button>
                          )}{" "}
                          {r.status === "listed" ? (
                            <>
                              <button className="btn sm ghost" onClick={() => run(() => unlistInventoryItem(r.id))} disabled={pending}>
                                Unlist
                              </button>{" "}
                            </>
                          ) : null}
                          <button className="btn sm ghost" onClick={() => openPanel(r, "list")} disabled={pending}>
                            List
                          </button>{" "}
                          <button className="btn sm ghost" onClick={() => openPanel(r, "edit")} disabled={pending}>
                            Edit
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {panel?.rowId === r.id && r.status !== "sold" ? (
                    <tr>
                      <td colSpan={12} style={{ padding: 0 }}>
                        <ActionPanel
                          key={`${panel.rowId}:${panel.kind}`}
                          row={r}
                          kind={panel.kind}
                          feeProfiles={feeProfiles}
                          onClose={() => setPanel(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>Totals (filtered: {filtered.length} of {rows.length})</td>
                  <td></td>
                  <td></td>
                  <td className="num">{totals.qty}</td>
                  <td className="num">{formatMoney(totals.cost)}</td>
                  <td className="num">{formatMoney(totals.market)}</td>
                  <td className="num">
                    <Delta value={totals.pl$} kind="money" />
                  </td>
                  <td className="num">
                    <Delta value={totals.plPct} kind="percent" />
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        Showing {filtered.length} of {rows.length} · press <kbd>Tab</kbd> to move through rows · every column is sortable.
      </div>
    </div>
  );
}

/**
 * Inline sell/list/edit panel rendered as a full-width row under the card it
 * acts on. Replaces the old window.prompt flow: prefilled price, live
 * net-after-fees preview via netProceeds (client-side, no round-trip), and
 * server-action errors surfaced inline instead of silently dropped.
 */
function ActionPanel({
  row,
  kind,
  feeProfiles,
  onClose,
}: {
  row: InventoryRow;
  kind: PanelKind;
  feeProfiles: Record<Marketplace, FeeProfile>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [price, setPrice] = useState(() => String(kind === "edit" ? row.costBasis : row.marketPrice ?? row.costBasis));
  const [marketplace, setMarketplace] = useState<Marketplace>("tcgplayer");
  const [error, setError] = useState<string | null>(null);

  const parsed = parseFloat(price);
  // Sell/List need a positive price; Edit allows a cost basis of 0 (freebies).
  const valid = Number.isFinite(parsed) && (kind === "edit" ? parsed >= 0 : parsed > 0);
  const preview = kind !== "edit" && valid ? netProceeds(parsed, row.quantity, feeProfiles[marketplace]) : null;
  const projectedPL = preview ? round2(preview.net - row.costBasis * row.quantity) : null;
  const title = kind === "sell" ? "Sell" : kind === "list" ? "List" : "Edit";

  const confirm = () => {
    if (!valid || pending) return;
    startTransition(async () => {
      const res: { ok: boolean; error?: string } =
        kind === "sell"
          ? await sellInventoryItem(row.id, parsed, marketplace)
          : kind === "list"
            ? await listInventoryItem(row.id, parsed, marketplace)
            : await updateInventoryItem(row.id, { costBasis: parsed });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 14px" }}
    >
      <b>
        {title} {row.name}
        {row.quantity > 1 ? ` × ${row.quantity}` : ""}
      </b>
      <label className="hint" htmlFor={`panel-price-${row.id}`}>
        {kind === "edit" ? "Cost basis / unit" : "Price / unit"}
      </label>
      <input
        id={`panel-price-${row.id}`}
        autoFocus
        type="number"
        min={0}
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirm();
          }
        }}
        style={{ width: 110 }}
      />
      {kind !== "edit" ? (
        <select value={marketplace} onChange={(e) => setMarketplace(e.target.value as Marketplace)} aria-label="Marketplace">
          {MARKETPLACES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : null}
      <button className="btn pri" onClick={confirm} disabled={pending || !valid}>
        {kind === "sell" ? "Sell" : kind === "list" ? "List" : "Save"}
      </button>
      <button className="btn ghost" onClick={onClose} disabled={pending}>
        Cancel
      </button>
      {preview ? (
        <span className="hint">
          {kind === "list" ? "If it sells at this price: " : ""}
          Gross {formatMoney(preview.gross)} · Fees + shipping {formatMoney(preview.feeAmount + preview.shipping)} · Net{" "}
          <b>{formatMoney(preview.net)}</b>
          {row.quantity > 1 ? ` (${formatMoney(preview.netPerUnit)}/unit)` : ""}
        </span>
      ) : null}
      {kind === "sell" && projectedPL != null ? (
        <span className="hint">
          Projected realized P/L <Delta value={projectedPL} kind="money" />
        </span>
      ) : null}
      {error ? (
        <span className="down" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function AddCardForm({ catalog, onDone }: { catalog: CatalogEntry[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition>("NM");
  const [costBasis, setCostBasis] = useState(0);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return catalog.filter((c) => fuzzy(q, `${c.name} ${c.setCode}`)).slice(0, 8);
  }, [q, catalog]);

  const submit = () => {
    if (!picked || pending) return;
    startTransition(async () => {
      const res = await addInventoryItem({ cardId: picked.id, quantity, condition, costBasis, tags });
      // Keep the form open on failure so nothing the user typed is lost.
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="phead" style={{ marginBottom: 10 }}>
        <h2>Add a card</h2>
        <button className="btn sm ghost" onClick={onDone}>
          Close
        </button>
      </div>
      {!picked ? (
        <>
          <input autoFocus placeholder="Search the catalog…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} aria-label="Search catalog" />
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {matches.map((c) => (
              <button key={c.id} className="btn ghost" style={{ justifyContent: "flex-start" }} onClick={() => setPicked(c)}>
                <span className={`dot g-${c.gameSlug}`} /> {c.name} <span className="hint">· {c.setCode}</span>
              </button>
            ))}
            {q && matches.length === 0 ? <div className="hint">No catalog match.</div> : null}
          </div>
        </>
      ) : (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div>
            <label className="hint">Card</label>
            <div className="cname">{picked.name}</div>
            <button className="btn sm ghost" onClick={() => setPicked(null)}>
              change
            </button>
          </div>
          <div>
            <label className="hint">Qty</label>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className="hint">Condition</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {CONDITIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="hint">Cost basis</label>
            <input type="number" min={0} step="0.01" value={costBasis} onChange={(e) => setCostBasis(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="hint">Tags</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="binder-A,spec" />
          </div>
          <button className="btn pri" onClick={submit} disabled={pending}>
            Add
          </button>
        </div>
        {error ? (
          <div className="down" role="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        ) : null}
        </>
      )}
    </div>
  );
}
