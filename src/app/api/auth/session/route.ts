import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers });
  return NextResponse.json({ user }, {
    headers,
  });
}
