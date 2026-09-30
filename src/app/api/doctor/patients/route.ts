import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getDoctorForUser } from "@/lib/doctor-access";
import { dateFromValue } from "@/lib/appointments";
import { normalizeRegisterNo, patientGenderValues } from "@/lib/patients";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerNoSchema = z.string().transform(normalizeRegisterNo).pipe(z.string().min(2).max(20));
const patientSchema = z.object({
  patientId: z.string().min(1),
  registerNo: registerNoSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  phone: z.string().trim().min(1).max(30),
  birthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
  gender: z.union([z.enum(patientGenderValues), z.literal(""), z.null()]),
  address: z.union([z.string().trim().max(500), z.null()]).optional(),
  notes: z.union([z.string().trim().max(2000), z.null()]).optional(),
});

function patientSelect() {
  return {
    id: true,
    registerNo: true,
    firstName: true,
    lastName: true,
    phone: true,
    birthDate: true,
    gender: true,
    address: true,
    notes: true,
  } satisfies Prisma.PatientSelect;
}

function serializePatient<T extends { birthDate: Date | null }>(patient: T) {
  return {
    ...patient,
    birthDate: patient.birthDate?.toISOString().slice(0, 10) ?? null,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const doctor = user ? await getDoctorForUser(user) : null;
  if (!doctor) return NextResponse.json({ error: "Эмчийн эрхээр нэвтэрнэ үү." }, { status: 403 });

  const registerNo = registerNoSchema.safeParse(new URL(request.url).searchParams.get("registerNo") ?? "");
  if (!registerNo.success) return NextResponse.json({ error: "Регистрийн дугаарыг зөв оруулна уу." }, { status: 400 });

  const patient = await prisma.patient.findFirst({
    where: {
      registerNo: { equals: registerNo.data, mode: "insensitive" },
      appointments: { some: { doctorId: doctor.id } },
    },
    select: {
      ...patientSelect(),
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        take: 10,
        select: {
          id: true,
          appointmentDate: true,
          startTime: true,
          status: true,
          doctor: { select: { fullName: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!patient) return NextResponse.json({ error: "Энэ РД-тай үйлчлүүлэгч олдсонгүй." }, { status: 404 });

  return NextResponse.json({
    patient: {
      ...serializePatient(patient),
      appointments: patient.appointments.map((appointment) => ({
        ...appointment,
        appointmentDate: appointment.appointmentDate.toISOString(),
      })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const doctor = user ? await getDoctorForUser(user) : null;
  if (!user || !doctor) return NextResponse.json({ error: "Эмчийн эрхээр нэвтэрнэ үү." }, { status: 403 });

  try {
    const parsed = patientSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Үйлчлүүлэгчийн мэдээлэл буруу байна." }, { status: 400 });
    }

    const birthDate = parsed.data.birthDate ? dateFromValue(parsed.data.birthDate) : null;
    if (parsed.data.birthDate && !birthDate) return NextResponse.json({ error: "Төрсөн огноо буруу байна." }, { status: 400 });

    const existing = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        appointments: { some: { doctorId: doctor.id } },
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Үйлчлүүлэгч олдсонгүй." }, { status: 404 });

    const patient = await prisma.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: { id: parsed.data.patientId },
        data: {
          registerNo: parsed.data.registerNo,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          ...(parsed.data.birthDate !== undefined ? { birthDate } : {}),
          gender: parsed.data.gender || null,
          address: parsed.data.address || null,
          notes: parsed.data.notes || null,
        },
        select: patientSelect(),
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "update patient profile",
          entity: "Patient",
          entityId: updated.id,
          details: "Үйлчлүүлэгчийн үндсэн мэдээлэл шинэчлэв",
        },
      });
      return updated;
    });

    return NextResponse.json({ patient: serializePatient(patient) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Энэ РД өөр үйлчлүүлэгч дээр бүртгэлтэй байна." }, { status: 409 });
    }
    console.error("Update patient profile failed:", error);
    return NextResponse.json({ error: "Үйлчлүүлэгчийн мэдээлэл хадгалах үед алдаа гарлаа." }, { status: 500 });
  }
}
