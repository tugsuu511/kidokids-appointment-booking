import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ATTENDANCE_PAGE_SIZE, MAX_ATTENDANCE_MS, attendanceRange, attendanceRecordRange } from "@/lib/attendance";
import type { SessionUser } from "@/types/auth";

// Serialize transitions per employee, including concurrent logins on different devices.
export async function startAttendance(user: Pick<SessionUser, "id" | "sessionVersion">) {
  return prisma.$transaction(async (tx) => {
    const identities = await tx.$queryRaw<{ isActive: boolean; sessionVersion: number }[]>`
      SELECT "isActive", "sessionVersion" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    if (!identities[0]?.isActive || identities[0].sessionVersion !== user.sessionVersion) {
      throw new Error("The user changed while signing in.");
    }
    const now = new Date();
    await tx.attendance.updateMany({
      where: { userId: user.id, checkOut: null, missedCheckOut: false, checkIn: { lt: new Date(now.getTime() - MAX_ATTENDANCE_MS) } },
      data: { missedCheckOut: true },
    });
    const open = await tx.attendance.findFirst({
      where: { userId: user.id, checkOut: null, missedCheckOut: false }, select: { id: true },
    });
    return open ?? tx.attendance.create({ data: { userId: user.id, checkIn: now }, select: { id: true } });
  });
}

export async function finishAttendance(user: SessionUser) {
  // Older cookies have no attendance identity. They must never close a newer shift.
  if (!user.attendanceId) return;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const record = await tx.attendance.findFirst({
      where: { id: user.attendanceId, userId: user.id, checkOut: null, missedCheckOut: false },
      select: { id: true, checkIn: true },
    });
    if (!record) return;
    const now = new Date();
    await tx.attendance.update({
      where: { id: record.id },
      // An explicit checkout is factual, even for an unusually long shift.
      data: { checkOut: now },
    });
  });
}

type Summary = { userId: string; sessions: number; days: number; completed: number; incomplete: number; durationMs: number };

export async function getAttendanceReport(user: SessionUser, filters: { from: string; to: string; userId?: string; page: number; calendarMonth?: string }) {
  const { start, end } = attendanceRange(filters.from, filters.to);
  const userId = user.role === "ADMIN" ? filters.userId || undefined : user.id;
  const where = { ...(userId ? { userId } : {}), checkIn: { gte: start, lt: end } };
  const recordRange = attendanceRecordRange(filters.from, filters.to, filters.calendarMonth);
  const [employees, summary, total, records] = await prisma.$transaction([
    prisma.user.findMany({
      where: user.role === "ADMIN" ? {} : { id: user.id },
      select: { id: true, fullName: true, role: true, isActive: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }],
    }),
    prisma.$queryRaw<Summary[]>(Prisma.sql`
      SELECT "userId", COUNT(*)::int AS sessions,
        COUNT(DISTINCT ("checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ulaanbaatar')::date)::int AS days,
        COUNT("checkOut")::int AS completed,
        COUNT(*) FILTER (WHERE "checkOut" IS NULL)::int AS incomplete,
        COALESCE(SUM(EXTRACT(EPOCH FROM ("checkOut" - "checkIn")) * 1000), 0)::double precision AS "durationMs"
      FROM "Attendance"
      WHERE "checkIn" >= ${start} AND "checkIn" < ${end}
        ${userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty}
      GROUP BY "userId"`),
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where: { ...where, checkIn: { gte: recordRange.start, lt: recordRange.end } },
      select: { id: true, userId: true, checkIn: true, checkOut: true, missedCheckOut: true },
      orderBy: [{ checkIn: "desc" }, { id: "desc" }],
      ...(filters.calendarMonth ? {} : { skip: (filters.page - 1) * ATTENDANCE_PAGE_SIZE, take: ATTENDANCE_PAGE_SIZE }),
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return {
    employees, summary, total, page: filters.page, pageSize: ATTENDANCE_PAGE_SIZE,
    records: records.map((record) => ({
      ...record,
      missedCheckOut: record.missedCheckOut || (!record.checkOut && Date.now() - record.checkIn.getTime() > MAX_ATTENDANCE_MS),
      checkIn: record.checkIn.toISOString(), checkOut: record.checkOut?.toISOString() ?? null,
    })),
  };
}
