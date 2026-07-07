import Link from "next/link";
import { RefreshPrices } from "./RefreshPrices";

function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function TopBar({ user }: { user: { name: string | null; email: string } }) {
  return (
    <div className="topbar">
      <form action="/inventory" method="get" style={{ flex: 1, maxWidth: 460 }}>
        <input
          className="search"
          type="search"
          name="q"
          placeholder="Search any card across 5 games…   ⌘K"
          aria-label="Search cards"
          style={{ width: "100%" }}
        />
      </form>
      <RefreshPrices />
      <form action="/api/auth/signout" method="post">
        <button className="btn ghost sm" type="submit">
          Sign out
        </button>
      </form>
      <div className="avatar" title={user.email} aria-label={`Signed in as ${user.name ?? user.email}`}>
        {initials(user.name, user.email)}
      </div>
    </div>
  );
}
