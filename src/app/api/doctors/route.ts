import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, hasStaffAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const doctorFields = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(3).max(30),
  room: z.string().trim().max(30).nullable().optional(),
});

const updateDoctorSchema = z.object({
  id: z.string().min(1),
  fullName: doctorFields.shape.fullName.optional(),
  phone: doctorFields.shape.phone.optional(),
  room: doctorFields.shape.room,
  isActive: z.boolean().optional(),
}).refine((value) => value.fullName !== undefined || value.phone !== undefined || value.room !== undefined || value.isActive !== undefined, {
  message: "Шинэчлэх мэдээлэл байхгүй байна.",
});

const doctorSelect = {
  id: true,
  fullName: true,
  phone: true,
  room: true,
  isActive: true,
} as const;

async function requireStaffRegistryAccess() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await hasStaffAccess(user.id))) return null;
  return user;
}

export async function POST(request: Request) {
  if (!(await requireStaffRegistryAccess())) return NextResponse.json({ error: "Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 403 });

  try {
    const parsed = doctorFields.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Эмчийн мэдээлэл буруу байна." }, { status: 400 });

    const doctor = await prisma.doctor.create({
      data: { ...parsed.data, room: parsed.data.room || null },
      select: doctorSelect,
    });
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    console.error("Create doctor failed:", error);
    return NextResponse.json({ error: "Эмч нэмэх үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await requireStaffRegistryAccess())) return NextResponse.json({ error: "Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 403 });

  try {
    const parsed = updateDoctorSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Эмчийн мэдээлэл буруу байна." }, { status: 400 });

    const { id, ...data } = parsed.data;
    const doctor = await prisma.doctor.update({
      where: { id },
      data: { ...data, ...(data.room !== undefined ? { room: data.room || null } : {}) },
      select: doctorSelect,
    });
    return NextResponse.json({ doctor });
  } catch (error) {
    console.error("Update doctor failed:", error);
    return NextResponse.json({ error: "Эмчийн мэдээлэл шинэчлэх үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireStaffRegistryAccess())) return NextResponse.json({ error: "Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 403 });

  try {
    const body = z.object({ id: z.string().min(1) }).safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Эмч сонгоно уу." }, { status: 400 });

    const appointmentCount = await prisma.appointment.count({ where: { doctorId: body.data.id } });
    if (appointmentCount > 0) {
      return NextResponse.json({ error: "Захиалгын түүхтэй эмчийг устгах боломжгүй. Идэвхгүй болгоно уу." }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.doctorSchedule.deleteMany({ where: { doctorId: body.data.id } }),
      prisma.doctor.delete({ where: { id: body.data.id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete doctor failed:", error);
    return NextResponse.json({ error: "Эмч устгах үед алдаа гарлаа." }, { status: 500 });
  }
}
