import { gameBySlug } from "@/lib/constants";

export function GameDot({ slug }: { slug: string }) {
  return <span className={`dot g-${slug}`} aria-hidden="true" />;
}

export function GameChip({ slug, showBeta = true }: { slug: string; showBeta?: boolean }) {
  const game = gameBySlug(slug);
  return (
    <span className="chip">
      <GameDot slug={slug} />
      {game?.name ?? slug}
      {showBeta && game?.dataQuality === "beta" ? <span className="badge-beta">beta data</span> : null}
    </span>
  );
}
