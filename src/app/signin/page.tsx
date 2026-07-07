import Link from "next/link";

export default function SignInPage({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID);
  const errorMsg: Record<string, string> = {
    email: "Enter a valid email address.",
    missing: "That sign-in link was missing its token.",
    invalid: "That sign-in link is invalid or expired.",
    google_unconfigured: "Google sign-in isn't configured on this instance.",
    google_state: "Google sign-in failed a security check. Try again.",
    google_token: "Google sign-in couldn't complete. Try again.",
    google_email: "Google didn't return an email address.",
    google_failed: "Google sign-in failed. Try again.",
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="logo" style={{ fontSize: 26, textAlign: "center", marginBottom: 6 }}>
          Flip<span>Deck</span>
        </div>
        <div className="sub" style={{ textAlign: "center", marginBottom: 20 }}>
          Buy low. Sell high. Every card, every market.
        </div>

        <div className="panel">
          {searchParams.sent ? (
            <div className="bulk" style={{ marginBottom: 12 }}>
              ✉ Magic link sent to <b style={{ marginLeft: 4 }}>{searchParams.sent}</b>. In dev it&apos;s printed to the server console.
            </div>
          ) : null}
          {searchParams.error ? (
            <div className="hint" style={{ color: "var(--bad)", marginBottom: 12 }}>
              {errorMsg[searchParams.error] ?? "Sign-in failed."}
            </div>
          ) : null}

          <form action="/api/auth/magic" method="post" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="hint">Email magic link</label>
            <input type="email" name="email" placeholder="you@example.com" required aria-label="Email address" />
            <button className="btn pri" type="submit">
              Send me a sign-in link
            </button>
          </form>

          <div style={{ textAlign: "center", color: "var(--muted)", margin: "14px 0", fontSize: 12 }}>or</div>

          <a className="btn" href="/api/auth/google" style={{ width: "100%", justifyContent: "center" }} aria-disabled={!googleConfigured}>
            Continue with Google
          </a>
          {!googleConfigured ? (
            <div className="hint" style={{ marginTop: 6, textAlign: "center" }}>
              Set <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> to enable.
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link className="btn ghost" href="/">
            Continue to the demo →
          </Link>
        </div>
      </div>
    </div>
  );
}
