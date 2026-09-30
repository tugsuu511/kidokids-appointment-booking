import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getPatientDetailsForUser } from "@/lib/patient-queries";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });

  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: "Үйлчлүүлэгчийн ID буруу байна." }, { status: 400 });

  const patient = await getPatientDetailsForUser(user, id);
  if (patient === undefined) return NextResponse.json({ error: "Үйлчлүүлэгчийн мэдээлэл харах эрхгүй." }, { status: 403 });
  if (!patient) return NextResponse.json({ error: "Үйлчлүүлэгч олдсонгүй эсвэл танд харах эрх байхгүй." }, { status: 404 });

  return NextResponse.json({ patient }, { headers: { "Cache-Control": "no-store" } });
}
