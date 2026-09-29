import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createStaffAccessToken, getCurrentUser, hasStaffAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffAccessPasswordKey } from "@/lib/staff-access";

const passwordSchema = z.object({
  newPassword: z.string().min(8, "Нууц үг хамгийн багадаа 8 тэмдэгт байна."),
  confirmPassword: z.string(),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Нууц үг давтан оруулсан утгатай тохирохгүй байна.",
  path: ["confirmPassword"],
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Энэ хэсэгт нэвтрэх эрхгүй байна." }, { status: 403 });
  }

  try {
    const parsed = passwordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Нууц үгийн мэдээлэл буруу байна." }, { status: 400 });
    }

    const existingPassword = await prisma.setting.findUnique({
      where: { key: staffAccessPasswordKey },
      select: { id: true },
    });
    if (existingPassword && !(await hasStaffAccess(currentUser.id))) {
      return NextResponse.json({ error: "Эхлээд ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.setting.upsert({
      where: { key: staffAccessPasswordKey },
      create: { key: staffAccessPasswordKey, value: passwordHash },
      update: { value: passwordHash },
    });

    const token = await createStaffAccessToken(currentUser.id);
    const response = NextResponse.json({ success: true });
    response.cookies.set("staff-access", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 15,
    });
    return response;
  } catch (error) {
    console.error("Staff password update failed:", error);
    return NextResponse.json({ error: "Нууц үг хадгалах үед алдаа гарлаа." }, { status: 500 });
  }
}
