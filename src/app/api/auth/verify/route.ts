import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicLink } from "@/lib/auth";

// GET /api/auth/verify?token=… → sign in and redirect to the dashboard.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/signin?error=missing", req.url), 303);
  const user = await consumeMagicLink(token);
  if (!user) return NextResponse.redirect(new URL("/signin?error=invalid", req.url), 303);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
