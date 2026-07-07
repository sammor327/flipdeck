import { NextResponse, type NextRequest } from "next/server";
import { createMagicLink } from "@/lib/auth";

// POST /api/auth/magic  { email }
// Creates a magic link. Real email delivery is a TODO behind SMTP_URL; in dev
// the sign-in URL is printed to the server console.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.redirect(new URL("/signin?error=email", req.url), 303);
  }
  const { url } = await createMagicLink(email);
  if (process.env.SMTP_URL) {
    // TODO: send via nodemailer using SMTP_URL. Left out to avoid an extra dep.
  }
  // eslint-disable-next-line no-console
  console.log(`\n✉  FlipDeck magic link for ${email}:\n   ${url}\n`);
  return NextResponse.redirect(new URL(`/signin?sent=${encodeURIComponent(email)}`, req.url), 303);
}
