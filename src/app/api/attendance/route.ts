import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { attendanceDefaults, attendanceFilterSchema } from "@/lib/attendance";
import { getAttendanceReport } from "@/lib/attendance-queries";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Нэвтэрнэ үү." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const defaults = attendanceDefaults();
    const parsed = attendanceFilterSchema.safeParse({
      from: params.get("from") ?? defaults.from,
      to: params.get("to") ?? defaults.to,
      userId: params.get("userId") ?? undefined,
      page: params.get("page") ?? 1,
      calendarMonth: params.get("calendarMonth") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "Огноо, хугацаа эсвэл хуудасны дугаар буруу байна. Хугацаа 366 хоногоос хэтрэхгүй байна." }, { status: 400 });
    if (user.role !== "ADMIN" && parsed.data.userId && parsed.data.userId !== user.id) {
      return NextResponse.json({ error: "Зөвхөн өөрийн цагийн тайланг харах эрхтэй." }, { status: 403 });
    }
    return NextResponse.json(await getAttendanceReport(user, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Attendance report failed:", error);
    return NextResponse.json({ error: "Цагийн тайланг ачаалж чадсангүй. Дахин оролдоно уу." }, { status: 500 });
  }
}
