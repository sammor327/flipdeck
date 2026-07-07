import { gameBySlug } from "@/lib/constants";

// Card art. Renders real art when an imageUrl is present (e.g. Scryfall CDN),
// otherwise a self-contained, game-colored stylized card face so every card —
// including demo cards with no external image — shows consistent art. Server
// component: no client JS, no external dependency by default.

const WIDTHS = { thumb: 34, sm: 56, full: 190 } as const;

export function CardArt({
  name,
  gameSlug,
  setCode,
  rarity,
  imageUrl,
  size = "thumb",
}: {
  name: string;
  gameSlug: string;
  setCode?: string;
  rarity?: string;
  imageUrl?: string | null;
  size?: keyof typeof WIDTHS;
}) {
  const game = gameBySlug(gameSlug);
  const color = game?.accentColor ?? "#3987e5";
  const w = WIDTHS[size];
  const frame: React.CSSProperties = {
    width: w,
    aspectRatio: "63 / 88",
    borderRadius: size === "full" ? 10 : 6,
    border: "1px solid var(--border)",
    overflow: "hidden",
    flex: "none",
    position: "relative",
    background: `linear-gradient(160deg, ${color}22 0%, #1f1f1e 55%, #17171633 100%)`,
  };

  if (imageUrl) {
    return (
      <div style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  if (size === "full") {
    return (
      <div style={{ ...frame, display: "flex", flexDirection: "column", padding: 10 }} aria-label={`${name} card art`}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>{name}</div>
        <div
          style={{
            flex: 1,
            margin: "8px 0",
            borderRadius: 6,
            background: `radial-gradient(120% 80% at 30% 20%, ${color}55, ${color}14 60%, #14141300)`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span style={{ fontSize: 46, color, opacity: 0.9 }} aria-hidden="true">
            {game?.icon}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", justifyContent: "space-between", gap: 6 }}>
          <span>{setCode}</span>
          <span>{rarity}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...frame,
        display: "grid",
        placeItems: "center",
        background: `radial-gradient(120% 90% at 30% 15%, ${color}66, ${color}20 55%, #16161500)`,
      }}
      title={name}
      aria-label={`${name} card art`}
    >
      <span style={{ fontSize: Math.round(w * 0.42), color: "#fff", opacity: 0.85 }} aria-hidden="true">
        {game?.icon}
      </span>
    </div>
  );
}
