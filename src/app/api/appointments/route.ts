import { NextResponse } from "next/server";
import { AppointmentStatus } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getDailyAppointments, getDoctorDailySchedules } from "@/lib/appointment-queries";
import { dateFromValue, nextDay } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

const appointmentSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  patientId: z.string().optional(),
  patientName: z.string().trim().min(2),
  patientPhone: z.string().trim().max(30).optional(),
  doctorId: z.string().min(1),
  serviceId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

const statusSchema = z.enum([
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
]);
const availabilitySchema = z.object({
  doctorId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

class AppointmentConflictError extends Error {}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const parsed = availabilitySchema.safeParse({ doctorId: searchParams.get("doctorId") ?? undefined, date: searchParams.get("date") });
  if (!parsed.success) return NextResponse.json({ error: "Хайлтын мэдээлэл буруу байна." }, { status: 400 });

  const appointmentDate = dateFromValue(parsed.data.date);
  if (!appointmentDate) return NextResponse.json({ error: "Огноо буруу байна." }, { status: 400 });

  try {
    if (!parsed.data.doctorId) {
      const [appointments, doctorSchedules] = await Promise.all([
        getDailyAppointments(parsed.data.date),
        getDoctorDailySchedules(parsed.data.date),
      ]);
      return NextResponse.json({ appointments, doctorSchedules }, { headers: { "Cache-Control": "no-store" } });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId: parsed.data.doctorId,
        appointmentDate: { gte: appointmentDate, lt: nextDay(appointmentDate) },
      },
      select: { startTime: true, endTime: true, status: true },
      orderBy: [{ startTime: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ appointments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Load appointment availability failed:", error);
    return NextResponse.json({ error: "Цагийн мэдээлэл авахад алдаа гарлаа." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });

  try {
    const parsed = appointmentSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
      return NextResponse.json({ error: "Захиалгын мэдээлэл буруу байна." }, { status: 400 });
    }

    const { appointmentDate, startTime, endTime, patientId, patientName, patientPhone, doctorId, serviceId, notes } = parsed.data;
    const date = dateFromValue(appointmentDate);
    if (!date) return NextResponse.json({ error: "Огноо буруу байна." }, { status: 400 });
    const nextDate = nextDay(date);

    const nameParts = patientName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    const appointment = await prisma.$transaction(async (tx) => {
      // Serialize booking attempts for the same doctor and date.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctorId}), hashtext(${appointmentDate}))`;

      const existing = await tx.appointment.findFirst({
        where: {
          doctorId,
          appointmentDate: { gte: date, lt: nextDate },
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (existing) throw new AppointmentConflictError();

      const resolvedPatientId = patientId || (await tx.patient.findFirst({ where: { firstName, lastName, ...(patientPhone ? { phone: patientPhone } : {}) }, select: { id: true } }))?.id || (await tx.patient.create({
        data: { firstName, lastName, phone: patientPhone || "-" },
      })).id;

      return tx.appointment.create({
        data: { appointmentDate: date, startTime, endTime, patientId: resolvedPatientId, doctorId, serviceId, notes: notes || null },
      });
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ error: "Энэ эмчийн тухайн цаг захиалагдсан байна." }, { status: 409 });
    }
    console.error("Create appointment failed:", error);
    return NextResponse.json({ error: "Захиалга үүсгэх үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });

  try {
    const body = await request.json();
    const status = statusSchema.safeParse(body.status);
    if (!status.success || typeof body.id !== "string") {
      return NextResponse.json({ error: "Төлөвийн мэдээлэл буруу байна." }, { status: 400 });
    }
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Захиалга олдсонгүй." }, { status: 404 });

    const dateValue = existing.appointmentDate.toISOString().slice(0, 10);
    const date = dateFromValue(dateValue)!;
    const appointment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.doctorId}), hashtext(${dateValue}))`;

      // Reopening a cancelled booking must obey the same overlap rule as creating one.
      if (status.data !== AppointmentStatus.CANCELLED && status.data !== AppointmentStatus.NO_SHOW) {
        const conflict = await tx.appointment.findFirst({
          where: {
            id: { not: existing.id },
            doctorId: existing.doctorId,
            appointmentDate: { gte: date, lt: nextDay(date) },
            status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
            startTime: { lt: existing.endTime },
            endTime: { gt: existing.startTime },
          },
        });
        if (conflict) throw new AppointmentConflictError();
      }

      return tx.appointment.update({ where: { id: existing.id }, data: { status: status.data } });
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ error: "Энэ эмчийн тухайн цаг захиалагдсан тул төлөвийг өөрчлөх боломжгүй." }, { status: 409 });
    }
    console.error("Update appointment failed:", error);
    return NextResponse.json({ error: "Захиалгын төлөв шинэчлэх үед алдаа гарлаа." }, { status: 500 });
  }
}
