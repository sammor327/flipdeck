"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", icon: "◧", label: "Dashboard", exact: true },
  { href: "/inventory", icon: "▤", label: "Inventory" },
  { href: "/watchlist", icon: "☆", label: "Watchlist" },
  { href: "/alerts", icon: "⚡", label: "Alerts & Approvals", badgeKey: "approvals" as const },
  { href: "/spread", icon: "⇄", label: "Spread Scanner" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];

export function Sidebar({
  approvals,
  freshness,
  fastLaneCards,
}: {
  approvals: number;
  freshness: string;
  fastLaneCards: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <button
        className="btn ghost mobile-only"
        aria-label="Toggle navigation"
        onClick={() => setOpen((o) => !o)}
        style={{ position: "fixed", top: 12, left: 12, zIndex: 50 }}
      >
        ☰
      </button>
      <aside className={`side ${open ? "open" : ""}`}>
        <div className="logo">
          Flip<span>Deck</span>
        </div>
        <nav aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav ${isActive(item.href, item.exact) ? "on" : ""}`}
              aria-current={isActive(item.href, item.exact) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span className="ic" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
              {item.badgeKey === "approvals" && approvals > 0 ? <span className="pill">{approvals}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="foot">
          Prices refreshed {freshness}
          <br />
          Fast lane: 5 min · {fastLaneCards} cards
        </div>
      </aside>
    </>
  );
}
