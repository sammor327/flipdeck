"use client";

import { type KeyboardEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONDITIONS, GAMES, type Condition } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import type { InventoryRow } from "@/lib/queries";
import {
  addInventoryItem,
  bulkAddTag,
  bulkDelete,
  bulkList,
  importInventoryCsv,
  listInventoryItem,
  sellInventoryItem,
  updateInventoryItem,
} from "@/app/actions/inventory";
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
}: {
  rows: InventoryRow[];
  catalog: CatalogEntry[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [game, setGame] = useState<string>("all");
  const [condition, setCondition] = useState<string>("any");
  const [pl, setPl] = useState<string>("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "unrealizedPct", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);
  const [tagFilter, setTagFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (game !== "all" && r.gameSlug !== game) return false;
      if (condition !== "any" && r.condition !== condition) return false;
      if (pl === "winners" && r.unrealizedPL <= 0) return false;
      if (pl === "losers" && r.unrealizedPL >= 0) return false;
      if (tagFilter !== "all" && !r.tags.includes(tagFilter)) return false;
      if (query && !fuzzy(query, `${r.name} ${r.setName} ${r.setCode} ${r.tags.join(" ")}`)) return false;
      return true;
    });
    out.sort((a, b) => {
      const dir = sort.dir;
      // "game" sorts by display name; every other SortKey is a real InventoryRow field.
      const av: string | number | null = sort.key === "game" ? a.gameName : a[sort.key];
      const bv: string | number | null = sort.key === "game" ? b.gameName : b[sort.key];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av ?? 0) - Number(bv ?? 0)) * dir;
    });
    return out;
  }, [rows, game, condition, pl, tagFilter, query, sort]);

  const totals = useMemo(() => {
    let qty = 0;
    let cost = 0;
    let market = 0;
    for (const r of filtered) {
      qty += r.quantity;
      cost += r.costBasis * r.quantity;
      market += r.marketValue;
    }
    const pl$ = market - cost;
    return { qty, cost, market, pl$, plPct: cost > 0 ? (pl$ / cost) * 100 : null };
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
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      if (allVisibleSelected) return new Set();
      return new Set(filtered.map((r) => r.id));
    });

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const onSell = (r: InventoryRow) => {
    const price = window.prompt(`Sale price per unit for ${r.name}?`, String(r.marketPrice ?? r.costBasis));
    if (price == null) return;
    const n = parseFloat(price);
    if (!Number.isFinite(n)) return;
    run(() => sellInventoryItem(r.id, n));
  };
  const onList = (r: InventoryRow) => {
    const price = window.prompt(`List ${r.name} for sale at (per unit)?`, String(r.marketPrice ?? r.costBasis));
    if (price == null) return;
    const n = parseFloat(price);
    if (!Number.isFinite(n)) return;
    run(() => listInventoryItem(r.id, n));
  };
  const onEdit = (r: InventoryRow) => {
    const cost = window.prompt(`Cost basis per unit for ${r.name}?`, String(r.costBasis));
    if (cost == null) return;
    const n = parseFloat(cost);
    if (!Number.isFinite(n)) return;
    run(() => updateInventoryItem(r.id, { costBasis: n }));
  };

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

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div className="bulk" style={{ marginBottom: 12 }}>
          <b>{selected.size} selected</b>
          <button
            className="btn sm"
            onClick={() => {
              const price = window.prompt("List all selected for sale at (per unit)?");
              if (price == null) return;
              const n = parseFloat(price);
              if (Number.isFinite(n)) run(() => bulkList([...selected], n).then(() => setSelected(new Set())));
            }}
          >
            List for sale
          </button>
          <button
            className="btn sm ghost"
            onClick={() => {
              const tag = window.prompt("Add tag to selected:");
              if (tag) run(() => bulkAddTag([...selected], tag).then(() => setSelected(new Set())));
            }}
          >
            Add tag
          </button>
          <button className="btn sm ghost" onClick={() => run(() => bulkDelete([...selected]).then(() => setSelected(new Set())))}>
            Delete
          </button>
          <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {filtered.length === 0 ? (
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
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`Select ${r.name}`} />
                    </td>
                    <td>
                      <Link href={`/cards/${r.cardId}`}>
                        <div className="cname">{r.name}</div>
                        <div className="cset">
                          {r.setCode} · {r.rarity} · #{r.collectorNumber}
                          {r.status === "listed" && r.listedPrice ? ` · Listed ${formatMoney(r.listedPrice)}` : ""}
                        </div>
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
                      <Delta value={r.unrealizedPL} kind="money" />
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
                      {r.status === "listed" ? (
                        <button className="btn sm ghost" onClick={() => onSell(r)} disabled={pending}>
                          Sell
                        </button>
                      ) : (
                        <button className="btn sm pri" onClick={() => onSell(r)} disabled={pending}>
                          Sell
                        </button>
                      )}{" "}
                      <button className="btn sm ghost" onClick={() => onList(r)} disabled={pending}>
                        List
                      </button>{" "}
                      <button className="btn sm ghost" onClick={() => onEdit(r)} disabled={pending}>
                        Edit
                      </button>
                    </td>
                  </tr>
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

function AddCardForm({ catalog, onDone }: { catalog: CatalogEntry[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition>("NM");
  const [costBasis, setCostBasis] = useState(0);
  const [tags, setTags] = useState("");

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return catalog.filter((c) => fuzzy(q, `${c.name} ${c.setCode}`)).slice(0, 8);
  }, [q, catalog]);

  const submit = () => {
    if (!picked) return;
    startTransition(async () => {
      await addInventoryItem({ cardId: picked.id, quantity, condition, costBasis, tags });
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
      )}
    </div>
  );
}
