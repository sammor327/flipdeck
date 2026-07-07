import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
      <div>
        <div className="logo" style={{ fontSize: 24, marginBottom: 8 }}>
          Flip<span>Deck</span>
        </div>
        <h1 style={{ marginBottom: 6 }}>404 — not found</h1>
        <div className="sub" style={{ marginBottom: 18 }}>
          That card or page doesn&apos;t exist (or moved markets).
        </div>
        <Link className="btn pri" href="/">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
