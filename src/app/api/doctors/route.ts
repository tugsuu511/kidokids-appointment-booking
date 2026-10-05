import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaffRegistryAccess, staffApiError } from "@/lib/staff-api";
import { createStaff, createStaffSchema, deleteStaff, StaffRegistryError, updateStaff, updateStaffSchema } from "@/lib/staff-registry";

// Older clients use this endpoint. Keep the same self-protection, session
// revocation, transactions and audit logging as the staff registry.
const doctorSelect = { id: true, fullName: true, phone: true, room: true, isActive: true, userId: true, user: { select: { id: true, fullName: true, username: true } } } as const;
const legacyId = z.object({ id: z.string().min(1) });

async function targetForDoctor(id: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!doctor) throw new StaffRegistryError("Эмчийн бүртгэл олдсонгүй.", 404);
  return doctor.userId ? { userId: doctor.userId } : { doctorId: doctor.id };
}

export async function POST(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const body = await request.json();
    const parsed = createStaffSchema.safeParse({ ...body, typeId: "DOCTOR" });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const member = await createStaff(actor, parsed.data);
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: member.doctorId! }, select: doctorSelect });
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) { return staffApiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const body = await request.json();
    const id = legacyId.safeParse(body);
    if (!id.success) return NextResponse.json({ error: "Эмч сонгоно уу." }, { status: 400 });
    const target = await targetForDoctor(id.data.id);
    const parsed = updateStaffSchema.safeParse({
      ...target, fullName: body.fullName, phone: body.phone, room: body.room,
      username: body.username, temporaryPassword: body.temporaryPassword, isActive: body.isActive,
    });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    await updateStaff(actor, parsed.data);
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: id.data.id }, select: doctorSelect });
    return NextResponse.json({ doctor });
  } catch (error) { return staffApiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = legacyId.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Эмч сонгоно уу." }, { status: 400 });
    await deleteStaff(actor, await targetForDoctor(parsed.data.id));
    return NextResponse.json({ success: true });
  } catch (error) { return staffApiError(error); }
}
