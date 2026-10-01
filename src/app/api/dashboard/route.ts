import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { todayValue } from "@/lib/appointments";
import { getDashboardSummary } from "@/lib/dashboard-queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Энэ хэсэгт нэвтрэх эрхгүй байна." }, { status: 403 });
  }

  return NextResponse.json(await getDashboardSummary(todayValue()), {
    headers: { "Cache-Control": "no-store" },
  });
}
