import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, hasStaffAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const doctorFields = z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().min(3).max(30), room: z.string().trim().max(30).nullable().optional() });
const usernameSchema = z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Нэвтрэх нэр зөвхөн латин үсэг, тоо болон . _ - тэмдэгт агуулна.");
const passwordSchema = z.string().min(8).max(128).regex(/[A-Za-z]/, "Нууц үг үсэг агуулсан байна.").regex(/[0-9]/, "Нууц үг тоо агуулсан байна.");
const createDoctorSchema = doctorFields.extend({ username: usernameSchema, temporaryPassword: passwordSchema });
const updateDoctorSchema = z.object({
  id: z.string().min(1), fullName: doctorFields.shape.fullName.optional(), phone: doctorFields.shape.phone.optional(), room: doctorFields.shape.room,
  username: usernameSchema.optional(), temporaryPassword: passwordSchema.optional(), isActive: z.boolean().optional(),
}).refine((value) => value.fullName !== undefined || value.phone !== undefined || value.room !== undefined || value.username !== undefined || value.temporaryPassword !== undefined || value.isActive !== undefined, { message: "Шинэчлэх мэдээлэл байхгүй байна." });

const doctorSelect = { id: true, fullName: true, phone: true, room: true, isActive: true, userId: true, user: { select: { id: true, fullName: true, username: true } } } as const;

async function requireStaffRegistryAccess() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await hasStaffAccess(user.id))) return null;
  return user;
}

export async function POST(request: Request) {
  if (!(await requireStaffRegistryAccess())) return NextResponse.json({ error: "Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 403 });
  try {
    const parsed = createDoctorSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Эмчийн мэдээлэл буруу байна." }, { status: 400 });
    const { username, temporaryPassword, ...doctorData } = parsed.data;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const doctor = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({ data: { username, passwordHash, fullName: doctorData.fullName, role: "DOCTOR", isActive: true } });
      return tx.doctor.create({ data: { ...doctorData, room: doctorData.room || null, userId: account.id }, select: doctorSelect });
    });
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Энэ нэвтрэх нэр аль хэдийн бүртгэлтэй байна." }, { status: 409 });
    console.error("Create doctor failed:", error);
    return NextResponse.json({ error: "Эмч нэмэх үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await requireStaffRegistryAccess())) return NextResponse.json({ error: "Ажилтны бүртгэлийн нууц үгээр нэвтэрнэ үү." }, { status: 403 });
  try {
    const parsed = updateDoctorSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Эмчийн мэдээлэл буруу байна." }, { status: 400 });
    const { id, username, temporaryPassword, ...data } = parsed.data;
    const existing = await prisma.doctor.findUnique({ where: { id }, select: { userId: true, fullName: true, isActive: true } });
    if (!existing) return NextResponse.json({ error: "Эмчийн бүртгэл олдсонгүй." }, { status: 404 });
    if (!existing.userId && ((username && !temporaryPassword) || (!username && temporaryPassword))) return NextResponse.json({ error: "Нэвтрэх эрх үүсгэхийн тулд нэвтрэх нэр, түр нууц үгийг хоёуланг нь оруулна уу." }, { status: 400 });
    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : undefined;
    const doctor = await prisma.$transaction(async (tx) => {
      let resolvedUserId = existing.userId;
      if (!resolvedUserId && username && passwordHash) {
        const account = await tx.user.create({ data: { username, passwordHash, fullName: data.fullName ?? existing.fullName, role: "DOCTOR", isActive: data.isActive ?? existing.isActive } });
        resolvedUserId = account.id;
      } else if (resolvedUserId) {
        await tx.user.update({ where: { id: resolvedUserId }, data: { ...(username !== undefined ? { username } : {}), ...(passwordHash ? { passwordHash } : {}), ...(data.fullName !== undefined ? { fullName: data.fullName } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
      }
      return tx.doctor.update({ where: { id }, data: { ...data, ...(data.room !== undefined ? { room: data.room || null } : {}), ...(resolvedUserId && !existing.userId ? { userId: resolvedUserId } : {}) }, select: doctorSelect });
    });
    return NextResponse.json({ doctor });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Энэ нэвтрэх нэр аль хэдийн бүртгэлтэй байна." }, { status: 409 });
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
    if (appointmentCount > 0) return NextResponse.json({ error: "Захиалгын түүхтэй эмчийг устгах боломжгүй. Идэвхгүй болгоно уу." }, { status: 409 });
    const doctor = await prisma.doctor.findUnique({ where: { id: body.data.id }, select: { userId: true } });
    await prisma.$transaction(async (tx) => { await tx.doctorSchedule.deleteMany({ where: { doctorId: body.data.id } }); await tx.doctor.delete({ where: { id: body.data.id } }); if (doctor?.userId) await tx.user.update({ where: { id: doctor.userId }, data: { isActive: false } }); });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete doctor failed:", error);
    return NextResponse.json({ error: "Эмч устгах үед алдаа гарлаа." }, { status: 500 });
  }
}
