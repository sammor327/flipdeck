import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSession, upsertUserByEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/auth/google/callback → exchange the code, sign the user in.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = cookies().get("g_state")?.value;
  if (!code || !state || state !== saved) {
    return NextResponse.redirect(new URL("/signin?error=google_state", req.url), 303);
  }

  const origin = process.env.APP_URL || url.origin;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return NextResponse.redirect(new URL("/signin?error=google_token", req.url), 303);
    const tok = (await tokenRes.json()) as { access_token?: string };
    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const info = (await infoRes.json()) as { sub?: string; email?: string; name?: string };
    if (!info.email) return NextResponse.redirect(new URL("/signin?error=google_email", req.url), 303);

    const user = await upsertUserByEmail(info.email, info.name);
    if (info.sub) {
      await prisma.account.upsert({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: info.sub } },
        create: { userId: user.id, provider: "google", providerAccountId: info.sub },
        update: {},
      });
    }
    await createSession(user.id);
    cookies().delete("g_state");
    return NextResponse.redirect(new URL("/", req.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/signin?error=google_failed", req.url), 303);
  }
}
