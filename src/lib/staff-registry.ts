import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { roleValues, type Role, type SessionUser } from "@/types/auth";
import { roleLabels, type StaffMember } from "@/types/staff";

const username = z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Нэвтрэх нэр зөвхөн латин үсэг, тоо болон . _ - тэмдэгт агуулна.");
// bcrypt only uses the first 72 bytes, including for non-ASCII passwords.
const password = z.string().min(8).max(72).regex(/[A-Za-z]/, "Нууц үг үсэг агуулсан байна.").regex(/[0-9]/, "Нууц үг тоо агуулсан байна.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Нууц үг 72 байтаас хэтрэхгүй байна.");
const fields = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30),
  room: z.string().trim().max(30).nullable().optional(),
  typeId: z.string().min(1).max(100),
  username,
  temporaryPassword: password,
  isActive: z.boolean(),
});

export const createStaffSchema = fields.extend({ isActive: z.boolean().default(true) });
export const staffTargetSchema = z.object({ userId: z.string().min(1).optional(), doctorId: z.string().min(1).optional() }).refine((value) => Boolean(value.userId) !== Boolean(value.doctorId), "Ажилтан сонгоно уу.");
export const updateStaffSchema = fields.partial().extend(staffTargetSchema.shape)
  .refine((value) => Boolean(value.userId) !== Boolean(value.doctorId), "Ажилтан сонгоно уу.")
  .refine((value) => Object.keys(fields.shape).some((key) => value[key as keyof typeof value] !== undefined), "Шинэчлэх мэдээлэл байхгүй байна.");
export const createStaffTypeSchema = z.object({ name: z.string().trim().min(2).max(60), role: z.enum(roleValues) });

const doctorSelect = { id: true, fullName: true, phone: true, room: true, isActive: true, userId: true } as const;
const userSelect = { id: true, fullName: true, username: true, phone: true, role: true, staffTypeId: true, isActive: true, doctor: { select: doctorSelect } } as const;
type StaffAccount = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type UnlinkedDoctor = Prisma.DoctorGetPayload<{ select: typeof doctorSelect }>;

function accountMember(user: StaffAccount): StaffMember {
  return {
    id: user.id, userId: user.id, doctorId: user.doctor?.id ?? null,
    fullName: user.fullName, username: user.username, phone: user.phone ?? user.doctor?.phone ?? "",
    room: user.doctor?.room ?? null, role: user.role, staffTypeId: user.staffTypeId, isActive: user.isActive,
  };
}

function doctorMember(doctor: UnlinkedDoctor): StaffMember {
  return { id: doctor.id, userId: null, doctorId: doctor.id, fullName: doctor.fullName, username: null, phone: doctor.phone, room: doctor.room, role: "DOCTOR", staffTypeId: null, isActive: doctor.isActive };
}

export async function getStaffRegistry() {
  const [users, doctors, types] = await Promise.all([
    prisma.user.findMany({ select: userSelect, orderBy: { fullName: "asc" } }),
    prisma.doctor.findMany({ where: { userId: null }, select: doctorSelect }),
    prisma.staffType.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  return { members: [...users.map(accountMember), ...doctors.map(doctorMember)], types };
}

export class StaffRegistryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function resolveType(tx: Prisma.TransactionClient, typeId: string): Promise<{ role: Role; staffTypeId: string | null }> {
  const role = roleValues.find((value) => value === typeId);
  if (role) return { role, staffTypeId: null };
  const type = await tx.staffType.findUnique({ where: { id: typeId }, select: { id: true, role: true } });
  if (!type) throw new StaffRegistryError("Ажилтны төрөл олдсонгүй.", 400);
  return { role: type.role, staffTypeId: type.id };
}

export async function staffTransaction<T>(actor: SessionUser, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: actor.id }, select: { isActive: true, role: true, sessionVersion: true } });
    if (!current?.isActive || current.role !== "ADMIN" || current.sessionVersion !== (actor.sessionVersion ?? 0)) throw new StaffRegistryError("Ажилтны бүртгэл удирдах эрхгүй байна.", 403);
    return operation(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function audit(tx: Prisma.TransactionClient, actor: SessionUser, action: string, entity: string, entityId: string) {
  return tx.auditLog.create({ data: { userId: actor.id, action, entity, entityId } });
}

export async function createStaff(actor: SessionUser, data: z.infer<typeof createStaffSchema>) {
  const passwordHash = await bcrypt.hash(data.temporaryPassword, 10);
  return staffTransaction(actor, async (tx) => {
    const type = await resolveType(tx, data.typeId);
    if (type.role === "DOCTOR" && data.phone.length < 3) throw new StaffRegistryError("Эмчийн утасны дугаарыг оруулна уу.", 400);
    const user = await tx.user.create({
      data: {
        fullName: data.fullName, username: data.username, passwordHash, phone: data.phone || null,
        ...type, isActive: data.isActive,
        ...(type.role === "DOCTOR" ? { doctor: { create: { fullName: data.fullName, phone: data.phone, room: data.room || null, isActive: data.isActive } } } : {}),
      }, select: userSelect,
    });
    await audit(tx, actor, "CREATE_STAFF", "User", user.id);
    return accountMember(user);
  });
}

async function findTarget(tx: Prisma.TransactionClient, actor: SessionUser, target: z.infer<typeof staffTargetSchema>) {
  if (target.userId === actor.id) throw new StaffRegistryError("Өөрийн бүртгэл болон эрхийг өөрчлөх боломжгүй.", 403);
  if (target.userId) {
    const user = await tx.user.findUnique({ where: { id: target.userId }, select: userSelect });
    if (!user) throw new StaffRegistryError("Ажилтны бүртгэл олдсонгүй.", 404);
    return { user, doctor: user.doctor };
  }
  const doctor = await tx.doctor.findUnique({ where: { id: target.doctorId }, select: doctorSelect });
  if (!doctor) throw new StaffRegistryError("Эмчийн бүртгэл олдсонгүй.", 404);
  if (doctor.userId === actor.id) throw new StaffRegistryError("Өөрийн бүртгэл болон эрхийг өөрчлөх боломжгүй.", 403);
  if (doctor.userId) throw new StaffRegistryError("Ажилтны жагсаалтыг шинэчилж дахин оролдоно уу.", 409);
  return { user: null, doctor };
}

export async function updateStaff(actor: SessionUser, data: z.infer<typeof updateStaffSchema>) {
  const passwordHash = data.temporaryPassword ? await bcrypt.hash(data.temporaryPassword, 10) : undefined;
  return staffTransaction(actor, async (tx) => {
    const { user, doctor } = await findTarget(tx, actor, data);
    const type = data.typeId ? await resolveType(tx, data.typeId) : { role: user?.role ?? "DOCTOR", staffTypeId: user?.staffTypeId ?? null };
    const fullName = data.fullName ?? user?.fullName ?? doctor!.fullName;
    const phone = data.phone ?? user?.phone ?? doctor?.phone ?? "";
    const isActive = data.isActive ?? user?.isActive ?? doctor!.isActive;
    const room = data.room !== undefined ? data.room || null : doctor?.room ?? null;
    if (type.role === "DOCTOR" && phone.length < 3) throw new StaffRegistryError("Эмчийн утасны дугаарыг оруулна уу.", 400);

    // Existing doctors without an account remain editable; opening access requires both credentials.
    if (!user && !data.username && !passwordHash) {
      if (type.role !== "DOCTOR" || type.staffTypeId) throw new StaffRegistryError("Төрөл солихын өмнө нэвтрэх нэр, нууц үг оруулна уу.", 400);
      const updated = await tx.doctor.update({ where: { id: doctor!.id }, data: { fullName, phone, room, isActive }, select: doctorSelect });
      await audit(tx, actor, "UPDATE_STAFF", "Doctor", updated.id);
      return doctorMember(updated);
    }
    if (!user && (!data.username || !passwordHash)) throw new StaffRegistryError("Нэвтрэх нэр, нууц үгийг хоёуланг нь оруулна уу.", 400);

    const revokeSessions = user && (passwordHash || (data.username !== undefined && data.username !== user.username) || type.role !== user.role || type.staffTypeId !== user.staffTypeId || isActive !== user.isActive);
    const account = user
      ? await tx.user.update({ where: { id: user.id }, data: { fullName, phone: phone || null, ...type, isActive, ...(data.username ? { username: data.username } : {}), ...(passwordHash ? { passwordHash } : {}), ...(revokeSessions ? { sessionVersion: { increment: 1 } } : {}) }, select: { id: true } })
      : await tx.user.create({ data: { fullName, phone: phone || null, username: data.username!, passwordHash: passwordHash!, ...type, isActive }, select: { id: true } });
    if (doctor) {
      // Keep clinical history attached when a doctor moves to another role.
      await tx.doctor.update({ where: { id: doctor.id }, data: { userId: account.id, fullName, phone, room, isActive: type.role === "DOCTOR" && isActive } });
    } else if (type.role === "DOCTOR") {
      await tx.doctor.create({ data: { userId: account.id, fullName, phone, room, isActive } });
    }
    await audit(tx, actor, "UPDATE_STAFF", "User", account.id);
    return accountMember(await tx.user.findUniqueOrThrow({ where: { id: account.id }, select: userSelect }));
  });
}

export async function deleteStaff(actor: SessionUser, target: z.infer<typeof staffTargetSchema>) {
  return staffTransaction(actor, async (tx) => {
    const { user, doctor } = await findTarget(tx, actor, target);
    if (doctor && await tx.appointment.count({ where: { doctorId: doctor.id } })) throw new StaffRegistryError("Захиалгын түүхтэй ажилтныг устгах боломжгүй. Нэвтрэх эрхийг хаана уу.", 409);
    if (user && await tx.auditLog.count({ where: { userId: user.id } })) throw new StaffRegistryError("Үйлдлийн түүхтэй ажилтныг устгах боломжгүй. Нэвтрэх эрхийг хаана уу.", 409);
    if (user && await tx.attendance.count({ where: { userId: user.id } })) throw new StaffRegistryError("Цагийн бүртгэлтэй ажилтныг устгах боломжгүй. Нэвтрэх эрхийг хаана уу.", 409);
    if (doctor) {
      await tx.doctorSchedule.deleteMany({ where: { doctorId: doctor.id } });
      await tx.doctor.delete({ where: { id: doctor.id } });
    }
    if (user) await tx.user.delete({ where: { id: user.id } });
    await audit(tx, actor, "DELETE_STAFF", user ? "User" : "Doctor", user?.id ?? doctor!.id);
  });
}

export async function createStaffType(actor: SessionUser, data: z.infer<typeof createStaffTypeSchema>) {
  if (Object.values(roleLabels).some((name) => name.toLocaleLowerCase("mn") === data.name.toLocaleLowerCase("mn"))) throw new StaffRegistryError("Энэ ажилтны төрөл аль хэдийн байна.", 409);
  return staffTransaction(actor, async (tx) => {
    if (await tx.staffType.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } }, select: { id: true } })) throw new StaffRegistryError("Энэ ажилтны төрөл аль хэдийн байна.", 409);
    const type = await tx.staffType.create({ data, select: { id: true, name: true, role: true } });
    await audit(tx, actor, "CREATE_STAFF_TYPE", "StaffType", type.id);
    return type;
  });
}

export async function deleteStaffType(actor: SessionUser, id: string) {
  return staffTransaction(actor, async (tx) => {
    if (await tx.user.count({ where: { staffTypeId: id } })) throw new StaffRegistryError("Ажилтанд оноосон төрлийг устгах боломжгүй. Эхлээд ажилтны төрлийг солино уу.", 409);
    await tx.staffType.delete({ where: { id } });
    await audit(tx, actor, "DELETE_STAFF_TYPE", "StaffType", id);
  });
}
