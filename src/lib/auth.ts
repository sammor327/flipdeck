// Auth: opaque cookie sessions + email magic-link, with a dev fallback to the
// seeded demo user so the app is usable immediately. Google OAuth is wired in
// the route handlers under src/app/api/auth/google (active when GOOGLE_* env is
// set). Real magic-link email delivery is a TODO behind SMTP_URL; in dev the
// verify URL is printed to the server console.
//
// This module is server-only (uses next/headers). Never import it from client
// components or from the tsx worker/seed scripts.

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";

const COOKIE = "fd_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(COOKIE);
}

/**
 * The signed-in user for this request. In dev only, falls back to the seeded
 * demo user so a fresh clone shows a working product; set
 * DISABLE_DEMO_AUTOLOGIN=1 to require a real sign-in even in dev. In production
 * there is no fallback: no valid session means null. Cached per request.
 */
export const getCurrentUser = cache(async () => {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
    if (session && session.expiresAt > new Date()) return session.user;
  }
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_DEMO_AUTOLOGIN !== "1") {
    const email = process.env.DEMO_EMAIL || "demo@flipdeck.local";
    const demo = await prisma.user.findUnique({ where: { email } });
    return demo ?? null;
  }
  return null;
});

/**
 * The signed-in user, or a redirect to /signin. For pages/layouts only —
 * server actions and API routes should keep returning { ok: false } /
 * error responses instead of redirecting.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function upsertUserByEmail(email: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: { email, name: name ?? email.split("@")[0] },
  });
  await prisma.portfolio.create({ data: { userId: user.id } });
  await prisma.userSettings.create({ data: { userId: user.id } });
  return user;
}

export async function createMagicLink(email: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MS);
  await prisma.magicLinkToken.create({ data: { token, email, expiresAt } });
  const base = process.env.APP_URL || "http://localhost:3000";
  const url = `${base}/api/auth/verify?token=${token}`;
  return { url, token, expiresAt };
}

/** Consume a magic-link token → sign the user in (creating them if new). */
export async function consumeMagicLink(token: string) {
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await prisma.magicLinkToken.update({ where: { token }, data: { usedAt: new Date() } });
  const user = await upsertUserByEmail(row.email);
  await createSession(user.id);
  return user;
}
