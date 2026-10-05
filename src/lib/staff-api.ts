import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser, hasStaffAccess } from "@/lib/auth";
import { StaffRegistryError } from "@/lib/staff-registry";

export async function requireStaffRegistryAccess() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await hasStaffAccess(user.id))) {
    throw new StaffRegistryError("Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү.", 403);
  }
  return user;
}

export function staffApiError(error: unknown) {
  if (error instanceof StaffRegistryError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Хүсэлтийн мэдээлэл буруу байна." }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "Энэ нэвтрэх нэр эсвэл ажилтны төрөл аль хэдийн бүртгэлтэй байна." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "Бүртгэл олдсонгүй." }, { status: 404 });
    if (error.code === "P2003" || error.code === "P2034") return NextResponse.json({ error: "Холбоотой бүртгэл өөрчлөгдсөн байна. Жагсаалтыг шинэчилж дахин оролдоно уу." }, { status: 409 });
  }
  console.error("Staff registry request failed:", error);
  return NextResponse.json({ error: "Ажилтны бүртгэлийг шинэчлэх үед алдаа гарлаа." }, { status: 500 });
}
