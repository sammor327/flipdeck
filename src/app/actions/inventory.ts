"use server";

import { revalidatePath } from "next/cache";
import type { Condition, Marketplace } from "@/lib/constants";
import { MARKETPLACES, normalizeCondition } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mergeFeeProfiles } from "@/lib/feeProfiles";
import { netProceeds } from "@/lib/fees";
import { round2 } from "@/lib/math";

async function portfolioId(userId: string): Promise<string> {
  const existing = await prisma.portfolio.findFirst({ where: { userId } });
  if (existing) return existing.id;
  const created = await prisma.portfolio.create({ data: { userId } });
  return created.id;
}

// Validation at the write boundary: a NaN/negative price or an unrecognized
// marketplace string must never reach money math or the DB.
const isValidPrice = (price: number) => Number.isFinite(price) && price > 0;
const isKnownMarketplace = (marketplace: string) => MARKETPLACES.some((m) => m.id === marketplace);

async function ownItem(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const item = await prisma.inventoryItem.findFirst({ where: { id, portfolio: { userId: user.id } } });
  return item ? { user, item } : null;
}

export interface AddItemInput {
  cardId: string;
  quantity: number;
  condition: Condition;
  costBasis: number;
  tags?: string;
  location?: string;
}

export async function addInventoryItem(input: AddItemInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.cardId) return { ok: false, error: "Pick a card" };
  const pid = await portfolioId(user.id);
  await prisma.inventoryItem.create({
    data: {
      portfolioId: pid,
      cardId: input.cardId,
      quantity: Math.max(1, Math.floor(input.quantity || 1)),
      condition: normalizeCondition(input.condition) ?? "NM",
      costBasis: Math.max(0, input.costBasis || 0),
      tags: input.tags ?? "",
      location: input.location || null,
      status: "owned",
    },
  });
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true };
}

export async function updateInventoryItem(
  id: string,
  input: Partial<{ quantity: number; condition: Condition; costBasis: number; tags: string; location: string }>
) {
  const ctx = await ownItem(id);
  if (!ctx) return { ok: false, error: "Not found" };
  const condition = input.condition != null ? normalizeCondition(input.condition) : undefined;
  if (condition === null) return { ok: false, error: "Invalid condition" };
  await prisma.inventoryItem.update({
    where: { id },
    data: {
      quantity: input.quantity != null ? Math.max(1, Math.floor(input.quantity)) : undefined,
      condition,
      costBasis: input.costBasis != null ? Math.max(0, input.costBasis) : undefined,
      tags: input.tags,
      location: input.location,
    },
  });
  revalidatePath("/inventory");
  return { ok: true };
}

export async function listInventoryItem(id: string, price: number, marketplace: Marketplace = "tcgplayer") {
  if (!isValidPrice(price)) return { ok: false, error: "Enter a valid price" };
  if (!isKnownMarketplace(marketplace)) return { ok: false, error: "Unknown marketplace" };
  const ctx = await ownItem(id);
  if (!ctx) return { ok: false, error: "Not found" };
  // Conditional claim (same pattern as proposals): a stale tab must not flip a
  // sold row back to "listed" and re-enter it into active-portfolio math. The
  // sold* resets are belt-and-braces — an owned/listed row never has them set.
  const claim = await prisma.inventoryItem.updateMany({
    where: { id, status: { in: ["owned", "listed"] } },
    data: {
      status: "listed",
      listedPrice: round2(price),
      listedMarketplace: marketplace,
      soldPrice: null,
      soldFees: null,
      soldAt: null,
    },
  });
  if (claim.count === 0) return { ok: false, error: "Already sold" };
  revalidatePath("/inventory");
  return { ok: true };
}

export async function unlistInventoryItem(id: string) {
  const ctx = await ownItem(id);
  if (!ctx) return { ok: false, error: "Not found" };
  // Only a listed row can be unlisted — a stale tab must not resurrect a sold
  // row as "owned".
  const claim = await prisma.inventoryItem.updateMany({
    where: { id, status: "listed" },
    data: { status: "owned", listedPrice: null, listedMarketplace: null },
  });
  if (claim.count === 0) return { ok: false, error: "Not listed" };
  revalidatePath("/inventory");
  return { ok: true };
}

export async function sellInventoryItem(id: string, soldPrice: number, marketplace: Marketplace = "tcgplayer") {
  if (!isValidPrice(soldPrice)) return { ok: false, error: "Enter a valid price" };
  if (!isKnownMarketplace(marketplace)) return { ok: false, error: "Unknown marketplace" };
  const ctx = await ownItem(id);
  if (!ctx) return { ok: false, error: "Not found" };
  const settings = await prisma.userSettings.findUnique({ where: { userId: ctx.user.id } });
  const profiles = mergeFeeProfiles(settings?.feeProfiles);
  const proceeds = netProceeds(soldPrice, ctx.item.quantity, profiles[marketplace]);
  // Conditional claim: only an owned/listed row may transition to "sold". A
  // re-sell from a stale tab must not overwrite soldPrice/soldFees/soldAt and
  // rewrite realized-P/L history. ownItem() above handles auth + fee math; the
  // claim is the gate.
  const claim = await prisma.inventoryItem.updateMany({
    where: { id, status: { in: ["owned", "listed"] } },
    data: {
      status: "sold",
      soldPrice: round2(soldPrice),
      soldFees: round2(proceeds.feeAmount + proceeds.shipping),
      soldAt: new Date(),
      listedPrice: null,
      listedMarketplace: null,
    },
  });
  if (claim.count === 0) return { ok: false, error: "Already sold" };
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true, net: proceeds.net };
}

export async function deleteInventoryItem(id: string) {
  const ctx = await ownItem(id);
  if (!ctx) return { ok: false, error: "Not found" };
  await prisma.inventoryItem.delete({ where: { id } });
  revalidatePath("/inventory");
  return { ok: true };
}

// ── Bulk actions ─────────────────────────────────────────────────────────────
async function ownedIds(ids: string[], userId: string): Promise<string[]> {
  const rows = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, portfolio: { userId } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function bulkAddTag(ids: string[], tag: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const valid = await prisma.inventoryItem.findMany({ where: { id: { in: ids }, portfolio: { userId: user.id } } });
  for (const item of valid) {
    const tags = new Set(item.tags.split(",").map((t) => t.trim()).filter(Boolean));
    tags.add(tag.trim());
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { tags: [...tags].join(",") } });
  }
  revalidatePath("/inventory");
  return { ok: true, count: valid.length };
}

export async function bulkList(ids: string[], price: number) {
  if (!isValidPrice(price)) return { ok: false, error: "Enter a valid price", count: 0 };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const valid = await ownedIds(ids, user.id);
  // Status guard: sold rows selected in a stale tab are skipped, and the
  // returned count reflects the rows actually claimed, not the ids submitted.
  const claimed = await prisma.inventoryItem.updateMany({
    where: { id: { in: valid }, status: { in: ["owned", "listed"] } },
    data: { status: "listed", listedPrice: round2(price), listedMarketplace: "tcgplayer" },
  });
  revalidatePath("/inventory");
  return { ok: true, count: claimed.count };
}

export async function bulkDelete(ids: string[]) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const valid = await ownedIds(ids, user.id);
  await prisma.inventoryItem.deleteMany({ where: { id: { in: valid } } });
  revalidatePath("/inventory");
  return { ok: true, count: valid.length };
}

// ── CSV import ───────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Import inventory from CSV. Expected header (case-insensitive), order-flexible:
 *   name, set, condition, quantity, cost_basis, tags
 * Rows are matched to the existing catalog by card name (+ set when given).
 * Unmatched names are returned as `skipped`.
 */
export async function importInventoryCsv(text: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in", added: 0, skipped: [] as string[] };
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, error: "Empty CSV", added: 0, skipped: [] };

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name || h === name.replace("_", " "));
  const iName = col("name");
  const iSet = col("set");
  const iCond = col("condition");
  const iQty = col("quantity");
  const iCost = col("cost_basis") >= 0 ? col("cost_basis") : col("cost basis");
  const iTags = col("tags");
  if (iName < 0) return { ok: false, error: "CSV needs a 'name' column", added: 0, skipped: [] };

  const cards = await prisma.card.findMany({ select: { id: true, name: true, setCode: true, setName: true } });
  const byName = new Map<string, { id: string; setCode: string; setName: string }[]>();
  for (const c of cards) {
    const key = c.name.toLowerCase();
    (byName.get(key) ?? byName.set(key, []).get(key)!).push({ id: c.id, setCode: c.setCode, setName: c.setName });
  }

  const pid = await portfolioId(user.id);
  let added = 0;
  const skipped: string[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const name = cells[iName];
    if (!name) continue;
    const candidates = byName.get(name.toLowerCase());
    if (!candidates || candidates.length === 0) {
      skipped.push(name);
      continue;
    }
    const setWanted = iSet >= 0 ? cells[iSet]?.toLowerCase() : "";
    const match =
      (setWanted && candidates.find((c) => c.setCode.toLowerCase() === setWanted || c.setName.toLowerCase() === setWanted)) ||
      candidates[0];
    const rawCondition = iCond >= 0 ? cells[iCond] : "";
    const condition = rawCondition ? normalizeCondition(rawCondition) : "NM";
    if (condition == null) {
      skipped.push(`${name} (unknown condition "${rawCondition}")`);
      continue;
    }
    await prisma.inventoryItem.create({
      data: {
        portfolioId: pid,
        cardId: match.id,
        quantity: iQty >= 0 ? Math.max(1, parseInt(cells[iQty] || "1", 10) || 1) : 1,
        condition,
        costBasis: iCost >= 0 ? Math.max(0, parseFloat(cells[iCost] || "0") || 0) : 0,
        tags: iTags >= 0 ? cells[iTags] || "" : "",
        status: "owned",
      },
    });
    added++;
  }
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true, added, skipped };
}
