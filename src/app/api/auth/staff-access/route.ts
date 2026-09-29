import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createStaffAccessToken, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffAccessPasswordKey } from "@/lib/staff-access";

const passwordSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Энэ хэсэгт нэвтрэх эрхгүй байна." }, { status: 403 });
  }

  try {
    const parsed = passwordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Нууц үгээ оруулна уу." }, { status: 400 });
    }

    const passwordSetting = await prisma.setting.findUnique({
      where: { key: staffAccessPasswordKey },
      select: { value: true },
    });
    if (!passwordSetting?.value) {
      return NextResponse.json({ error: "Ажилтны бүртгэлийн тусдаа нууц үгийг эхлээд үүсгэнэ үү." }, { status: 428 });
    }
    if (!(await bcrypt.compare(parsed.data.password, passwordSetting.value))) {
      return NextResponse.json({ error: "Нууц үг буруу байна." }, { status: 401 });
    }

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
    console.error("Staff access verification failed:", error);
    return NextResponse.json({ error: "Нууц үг шалгах үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("staff-access", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("staff-access", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/doctors",
    maxAge: 0,
  });
  return response;
}
