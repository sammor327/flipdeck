import { arrow, deltaAria, directionOf, formatSignedMoney, formatSignedPercent } from "@/lib/format";

/**
 * The one and only way deltas are rendered. Shows an arrow + signed number
 * (meaning survives with color stripped) and a screen-reader-only spoken form.
 * Color is strictly supplementary — accessibility rule from the brief.
 */
export function Delta({
  value,
  kind = "percent",
  currency = "USD",
  digits = 1,
  className = "",
}: {
  value: number | null | undefined;
  kind?: "percent" | "money";
  currency?: string;
  digits?: number;
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className={`text-muted ${className}`}>—</span>;
  }
  const dir = directionOf(value);
  const colorClass = dir === "up" ? "up" : dir === "down" ? "down" : "";
  const body = kind === "percent" ? formatSignedPercent(value, digits) : formatSignedMoney(value, currency);
  return (
    <span className={`${colorClass} ${className}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      <span aria-hidden="true">
        {arrow(dir)} {body}
      </span>
      <span className="sr-only">{deltaAria(value, kind)}</span>
    </span>
  );
}
