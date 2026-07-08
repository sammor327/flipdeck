import { NextResponse, type NextRequest } from "next/server";
import { approveProposal, declineProposal } from "@/app/actions/proposals";

// POST /api/proposals/[id]/approve|decline → decide a proposal over HTTP, so the
// service worker's notification action buttons can act without opening a page.
// No auth of its own: the server actions authenticate via the session cookie
// (getCurrentUser reads cookies(), which works in route handlers) and enforce
// ownership + pending status + expiry atomically — same fail-closed gate as the
// in-app buttons.
export async function POST(_req: NextRequest, { params }: { params: { id: string; decision: string } }) {
  if (params.decision !== "approve" && params.decision !== "decline") {
    return NextResponse.json({ ok: false, error: "unknown decision" }, { status: 400 });
  }
  const result =
    params.decision === "approve" ? await approveProposal(params.id) : await declineProposal(params.id);
  const status = result.ok ? 200 : result.error === "Not found" ? 404 : 409;
  return NextResponse.json(result, { status });
}
