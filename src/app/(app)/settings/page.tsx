import { PushToggle } from "@/components/PushToggle";
import { SettingsForm, type SettingsFormData } from "@/components/SettingsForm";
import {
  DEFAULT_FEE_PROFILES,
  DEFAULT_MARKETPLACE_BY_GAME,
  GAMES,
  MARKETPLACES,
  type FeeProfile,
  type GameSlug,
  type Marketplace,
} from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { providerModeFor } from "@/lib/providers";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });

  const feeProfiles = {
    ...DEFAULT_FEE_PROFILES,
    ...(settings ? fromJson<Partial<Record<Marketplace, FeeProfile>>>(settings.feeProfiles, {}) : {}),
  } as Record<Marketplace, FeeProfile>;

  const defaultMarketplaces = {
    ...DEFAULT_MARKETPLACE_BY_GAME,
    ...(settings ? fromJson<Partial<Record<GameSlug, Marketplace>>>(settings.defaultMarketplaces, {}) : {}),
  };

  const initial: SettingsFormData = {
    quietHoursEnabled: settings?.quietHoursEnabled ?? true,
    quietHoursStart: settings?.quietHoursStart ?? 1320,
    quietHoursEnd: settings?.quietHoursEnd ?? 420,
    pushEnabled: settings?.pushEnabled ?? true,
    emailEnabled: settings?.emailEnabled ?? false,
    digestMode: settings?.digestMode ?? false,
    dailySpendCap: settings?.dailySpendCap ?? 500,
    killSwitch: settings?.killSwitch ?? false,
    defaultMarketplaces,
    feeProfiles,
  };

  const providerStatus = GAMES.map((g) => ({ game: g, info: providerModeFor(g.slug) }));

  return (
    <>
      <h1>Settings</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        Notification channels, safety limits, marketplaces, and the fee math behind every net figure.
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <h2>Web Push</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Opt in to browser push so proposals reach you on any device.
        </div>
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""} />
      </div>

      <SettingsForm initial={initial} />

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Price data sources</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Real adapters activate behind env flags; unset games use the mock random-walk provider.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Configured</th>
                <th>Active provider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {providerStatus.map(({ game, info }) => (
                <tr key={game.slug}>
                  <td className="cname">
                    <span className={`dot g-${game.slug}`} /> {game.name}
                    {game.dataQuality === "beta" ? <span className="badge-beta" style={{ marginLeft: 6 }}>beta data</span> : null}
                  </td>
                  <td>{info.mode}</td>
                  <td>{info.providerId}</td>
                  <td>{info.isMock ? <span className="tag">mock</span> : <span className="up">live ▲</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Execution modes (compliance)</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Where a marketplace&apos;s terms don&apos;t allow automated order placement, &ldquo;execute&rdquo; opens a prefilled deep link and
          you complete the trade. Mode is per-marketplace and shown here.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th>Region</th>
                <th>Currency</th>
                <th>Execution mode</th>
              </tr>
            </thead>
            <tbody>
              {MARKETPLACES.map((m) => (
                <tr key={m.id}>
                  <td className="cname">{m.name}</td>
                  <td>{m.region}</td>
                  <td>{m.currency}</td>
                  <td>
                    <span className="tag">{m.executionMode === "api" ? "places order via API" : "opens prefilled deep link"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
