import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Хэрэглэгчийн нэр болон нууц үг буруу байна." }, { status: 400 });
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        fullName: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Бүртгэлгүй хэрэглэгч эсвэл идэвхгүй байна." }, { status: 401 });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Нууц үг буруу байна." }, { status: 401 });
    }

    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    });

    const response = NextResponse.json({ success: true, redirectTo: "/dashboard" }, { status: 200 });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Нэвтрэх үед алдаа гарлаа." }, { status: 500 });
  }
}
