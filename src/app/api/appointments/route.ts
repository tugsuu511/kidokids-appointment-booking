import { NextResponse } from "next/server";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { canAccessAppointmentData } from "@/lib/permissions";
import { getDoctorForUser } from "@/lib/doctor-access";
import { publishAppointmentChange } from "@/lib/appointment-events";
import { getDailyAppointments, getDoctorDailySchedules } from "@/lib/appointment-queries";
import {
  appointmentStatusValues,
  canTransitionAppointmentStatus,
  dateFromValue,
  nextDay,
} from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { normalizeRegisterNo, patientGenderValues } from "@/lib/patients";

export const runtime = "nodejs";

const appointmentSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  patientId: z.string().optional(),
  patientName: z.string().trim().min(2),
  patientPhone: z.string().trim().max(30).optional(),
  patientRegisterNo: z.string().trim().max(20).optional(),
  patientBirthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  patientGender: z.union([z.enum(patientGenderValues), z.literal("")]).optional(),
  doctorId: z.string().min(1),
  serviceId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

const statusSchema = z.enum(appointmentStatusValues);
const availabilitySchema = z.object({
  doctorId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

class AppointmentConflictError extends Error {}
class AppointmentTransitionError extends Error {}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  if (!canAccessAppointmentData(user.role)) return NextResponse.json({ error: "Цагийн мэдээлэлд хандах эрхгүй байна." }, { status: 403 });

  const currentDoctor = await getDoctorForUser(user);
  if (user.role === "DOCTOR" && !currentDoctor) return NextResponse.json({ error: "Таны хэрэглэгч эмчийн бүртгэлтэй холбогдоогүй байна." }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const parsed = availabilitySchema.safeParse({ doctorId: searchParams.get("doctorId") ?? undefined, date: searchParams.get("date") });
  if (!parsed.success) return NextResponse.json({ error: "Хайлтын мэдээлэл буруу байна." }, { status: 400 });

  const appointmentDate = dateFromValue(parsed.data.date);
  if (!appointmentDate) return NextResponse.json({ error: "Огноо буруу байна." }, { status: 400 });

  const doctorId = user.role === "DOCTOR" ? currentDoctor!.id : parsed.data.doctorId;
  if (user.role === "DOCTOR" && parsed.data.doctorId && parsed.data.doctorId !== doctorId) return NextResponse.json({ error: "Бусад эмчийн цагийн мэдээлэл харах эрхгүй." }, { status: 403 });

  try {
    if (user.role === "DOCTOR") {
      const appointments = await getDailyAppointments(parsed.data.date, currentDoctor!.id);
      return NextResponse.json({ appointments }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!doctorId) {
      const [appointments, doctorSchedules] = await Promise.all([
        getDailyAppointments(parsed.data.date),
        getDoctorDailySchedules(parsed.data.date),
      ]);
      return NextResponse.json({ appointments, doctorSchedules }, { headers: { "Cache-Control": "no-store" } });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
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
  if (user.role === "DOCTOR") return NextResponse.json({ error: "Эмч зөвхөн өөрийн үзлэгээс давтан цаг үүсгэнэ үү." }, { status: 403 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") return NextResponse.json({ error: "Цаг захиалах эрхгүй байна." }, { status: 403 });

  try {
    const parsed = appointmentSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
      return NextResponse.json({ error: "Захиалгын мэдээлэл буруу байна." }, { status: 400 });
    }

    const {
      appointmentDate,
      startTime,
      endTime,
      patientId,
      patientName,
      patientPhone,
      patientRegisterNo,
      patientBirthDate,
      patientGender,
      doctorId,
      serviceId,
      notes,
    } = parsed.data;
    const date = dateFromValue(appointmentDate);
    if (!date) return NextResponse.json({ error: "Огноо буруу байна." }, { status: 400 });
    const birthDate = patientBirthDate ? dateFromValue(patientBirthDate) : null;
    if (patientBirthDate && !birthDate) return NextResponse.json({ error: "Төрсөн огноо буруу байна." }, { status: 400 });
    const nextDate = nextDay(date);
    const registerNo = patientRegisterNo ? normalizeRegisterNo(patientRegisterNo) : null;

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

      let resolvedPatientId = patientId;
      if (!resolvedPatientId && registerNo) {
        const registeredPatient = await tx.patient.findFirst({
          where: { registerNo: { equals: registerNo, mode: "insensitive" } },
          select: { id: true },
        });
        resolvedPatientId = registeredPatient?.id;
        if (registeredPatient && (patientPhone || birthDate || patientGender)) {
          await tx.patient.update({
            where: { id: registeredPatient.id },
            data: {
              ...(patientPhone ? { phone: patientPhone } : {}),
              ...(birthDate ? { birthDate } : {}),
              ...(patientGender ? { gender: patientGender } : {}),
            },
          });
        }
      }
      if (!resolvedPatientId && !registerNo) {
        resolvedPatientId = (await tx.patient.findFirst({
          where: { firstName, lastName, ...(patientPhone ? { phone: patientPhone } : {}) },
          select: { id: true },
        }))?.id;
      }
      resolvedPatientId ||= (await tx.patient.create({
        data: {
          registerNo,
          firstName,
          lastName,
          phone: patientPhone || "-",
          birthDate,
          gender: patientGender || null,
        },
      })).id;

      return tx.appointment.create({
        data: { appointmentDate: date, startTime, endTime, patientId: resolvedPatientId, doctorId, serviceId, notes: notes || null, status: AppointmentStatus.BOOKED },
      });
    });
    publishAppointmentChange({
      appointmentId: appointment.id,
      appointmentDate,
      doctorId,
      action: "created",
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ error: "Энэ эмчийн тухайн цаг захиалагдсан байна." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Энэ РД өөр үйлчлүүлэгч дээр бүртгэлтэй байна." }, { status: 409 });
    }
    console.error("Create appointment failed:", error);
    return NextResponse.json({ error: "Захиалга үүсгэх үед алдаа гарлаа." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  if (!canAccessAppointmentData(user.role)) return NextResponse.json({ error: "Цагийн төлөв өөрчлөх эрхгүй байна." }, { status: 403 });

  try {
    const body = await request.json();
    const status = statusSchema.safeParse(body.status);
    if (!status.success || typeof body.id !== "string") {
      return NextResponse.json({ error: "Төлөвийн мэдээлэл буруу байна." }, { status: 400 });
    }
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Захиалга олдсонгүй." }, { status: 404 });

    if (status.data === AppointmentStatus.COMPLETED) {
      return NextResponse.json({ error: "Үзлэгийг дуусгахдаа эмч тэмдэглэл болон төлбөрийн даалгаврыг хамт хадгална." }, { status: 409 });
    }
    if (status.data === AppointmentStatus.PAID) {
      return NextResponse.json({ error: "Төлбөр төлөгдсөнийг төлбөрийн хэсгээс баталгаажуулна." }, { status: 409 });
    }

    const currentDoctor = await getDoctorForUser(user);
    if (user.role === "DOCTOR" && (!currentDoctor || existing.doctorId !== currentDoctor.id)) {
      return NextResponse.json({ error: "Зөвхөн өөрийн цагийн төлвийг өөрчилнө үү." }, { status: 403 });
    }

    const dateValue = existing.appointmentDate.toISOString().slice(0, 10);
    const appointment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.doctorId}), hashtext(${dateValue}))`;
      const current = await tx.appointment.findUnique({ where: { id: existing.id } });
      if (!current || !canTransitionAppointmentStatus(current.status, status.data)) {
        throw new AppointmentTransitionError();
      }

      return current.status === status.data
        ? current
        : tx.appointment.update({ where: { id: current.id }, data: { status: status.data } });
    });
    publishAppointmentChange({
      appointmentId: appointment.id,
      appointmentDate: dateValue,
      doctorId: appointment.doctorId,
      action: "status-updated",
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof AppointmentTransitionError) {
      return NextResponse.json({ error: "Төлөвийг зөвхөн дараагийн зөвшөөрөгдсөн шат руу шилжүүлнэ." }, { status: 409 });
    }
    if (error instanceof AppointmentConflictError) {
      return NextResponse.json({ error: "Энэ эмчийн тухайн цаг захиалагдсан тул төлөвийг өөрчлөх боломжгүй." }, { status: 409 });
    }
    console.error("Update appointment failed:", error);
    return NextResponse.json({ error: "Захиалгын төлөв шинэчлэх үед алдаа гарлаа." }, { status: 500 });
  }
}
