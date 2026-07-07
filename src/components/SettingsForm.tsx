"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GAMES, MARKETPLACES, type FeeProfile, type GameSlug, type Marketplace } from "@/lib/constants";
import { updateSettings } from "@/app/actions/settings";

export interface SettingsFormData {
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  pushEnabled: boolean;
  emailEnabled: boolean;
  digestMode: boolean;
  dailySpendCap: number;
  killSwitch: boolean;
  defaultMarketplaces: Partial<Record<GameSlug, Marketplace>>;
  feeProfiles: Record<Marketplace, FeeProfile>;
}

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function SettingsForm({ initial }: { initial: SettingsFormData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [s, setS] = useState<SettingsFormData>(initial);

  const set = <K extends keyof SettingsFormData>(k: K, v: SettingsFormData[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const setFee = (m: Marketplace, k: keyof FeeProfile, v: number) =>
    setS((prev) => ({ ...prev, feeProfiles: { ...prev.feeProfiles, [m]: { ...prev.feeProfiles[m], [k]: v } } }));

  const save = () =>
    startTransition(async () => {
      await updateSettings(s);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Notifications */}
      <div className="panel">
        <h2>Notification channels &amp; quiet hours</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Choose how and when FlipDeck reaches you.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={s.pushEnabled} onChange={(e) => set("pushEnabled", e.target.checked)} /> Browser push notifications
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={s.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} /> Email notifications
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={s.digestMode} onChange={(e) => set("digestMode", e.target.checked)} /> Digest mode (one morning summary instead of a stream)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={s.quietHoursEnabled} onChange={(e) => set("quietHoursEnabled", e.target.checked)} /> Respect quiet hours
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label className="hint">
            From <input type="time" value={toTime(s.quietHoursStart)} onChange={(e) => set("quietHoursStart", toMin(e.target.value))} />
          </label>
          <label className="hint">
            to <input type="time" value={toTime(s.quietHoursEnd)} onChange={(e) => set("quietHoursEnd", toMin(e.target.value))} />
          </label>
        </div>
      </div>

      {/* Safety */}
      <div className="panel">
        <h2>Safety limits</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Every automated action has a log, an undo, and a kill switch.
        </div>
        <label className="hint" style={{ display: "block", marginBottom: 8 }}>
          Daily spend cap ($)
          <input type="number" min={0} value={s.dailySpendCap} onChange={(e) => set("dailySpendCap", parseFloat(e.target.value) || 0)} style={{ display: "block", marginTop: 4, width: 160 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bad)" }}>
          <input type="checkbox" checked={s.killSwitch} onChange={(e) => set("killSwitch", e.target.checked)} /> Kill switch — pause all proposals &amp; notifications
        </label>
      </div>

      {/* Default marketplaces */}
      <div className="panel">
        <h2>Default marketplace per game</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Which marketplace sets the primary price for each game.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {GAMES.map((g) => (
            <label key={g.slug} className="hint" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>
                <span className={`dot g-${g.slug}`} /> {g.name}
              </span>
              <select
                value={s.defaultMarketplaces[g.slug] ?? "tcgplayer"}
                onChange={(e) => set("defaultMarketplaces", { ...s.defaultMarketplaces, [g.slug]: e.target.value as Marketplace })}
              >
                {MARKETPLACES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {/* Fee profiles */}
      <div className="panel">
        <h2>Fee profiles</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Used in every net-proceeds and spread calculation.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th className="num">Commission %</th>
                <th className="num">Payment %</th>
                <th className="num">Shipping $</th>
                <th>Execution</th>
              </tr>
            </thead>
            <tbody>
              {MARKETPLACES.map((m) => {
                const fee = s.feeProfiles[m.id];
                return (
                  <tr key={m.id}>
                    <td className="cname">{m.name}</td>
                    <td className="num">
                      <input type="number" step="0.01" value={fee.feePct} onChange={(e) => setFee(m.id, "feePct", parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
                    </td>
                    <td className="num">
                      <input type="number" step="0.01" value={fee.paymentFeePct} onChange={(e) => setFee(m.id, "paymentFeePct", parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
                    </td>
                    <td className="num">
                      <input type="number" step="0.01" value={fee.shippingFlat} onChange={(e) => setFee(m.id, "shippingFlat", parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
                    </td>
                    <td>
                      <span className="tag">{m.executionMode === "api" ? "API order" : "deep link"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn pri" onClick={save} disabled={pending}>
          {saved ? "✓ Saved" : "Save settings"}
        </button>
        <span className="hint">Changes apply to future fee/spread math immediately.</span>
      </div>
    </div>
  );
}
