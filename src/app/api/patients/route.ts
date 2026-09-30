import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { listPatientsForUser } from "@/lib/patient-queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const pageValue = Number(searchParams.get("page") ?? "1");
  if (query.length > 100) return NextResponse.json({ error: "Хайлтын утга хэт урт байна." }, { status: 400 });
  if (!Number.isSafeInteger(pageValue) || pageValue < 1) return NextResponse.json({ error: "Хуудасны дугаар буруу байна." }, { status: 400 });

  const result = await listPatientsForUser(user, query, pageValue);
  if (!result) return NextResponse.json({ error: "Үйлчлүүлэгчийн мэдээлэл харах эрхгүй." }, { status: 403 });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
