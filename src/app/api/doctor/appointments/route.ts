import { AppointmentStatus, PaymentOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getDoctorForUser } from "@/lib/doctor-access";
import { dateFromValue, nextDay } from "@/lib/appointments";
import { publishAppointmentChange } from "@/lib/appointment-events";
import { prisma } from "@/lib/prisma";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("visit"), appointmentId: z.string().min(1), note: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("follow-up"), appointmentId: z.string().min(1), appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: time, endTime: time }),
  z.object({ action: z.literal("payment"), appointmentId: z.string().min(1), amount: z.coerce.number().positive().max(100_000_000), description: z.string().trim().max(500).optional() }),
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const doctor = user ? await getDoctorForUser(user) : null;
  if (!doctor) return NextResponse.json({ error: "Эмчийн эрхээр нэвтэрч, эмчийн профайлтайгаа холбогдоно уу." }, { status: 403 });

  try {
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Оруулсан мэдээлэл буруу байна." }, { status: 400 });
    if (parsed.data.action === "follow-up" && parsed.data.startTime >= parsed.data.endTime) return NextResponse.json({ error: "Дуусах цаг эхлэх цагаас хойш байх ёстой." }, { status: 400 });

    const appointment = await prisma.appointment.findFirst({
      where: { id: parsed.data.appointmentId, doctorId: doctor.id },
      include: { service: { select: { price: true } } },
    });
    if (!appointment) return NextResponse.json({ error: "Энэ цагт үйлдэл хийх эрхгүй байна." }, { status: 403 });

    if (parsed.data.action === "visit") {
      const visitRecord = await prisma.visitRecord.upsert({
        where: { appointmentId: appointment.id },
        create: { appointmentId: appointment.id, doctorId: doctor.id, note: parsed.data.note },
        update: { note: parsed.data.note },
      });
      return NextResponse.json({ visitRecord });
    }

    if (parsed.data.action === "payment") {
      const paymentOrder = await prisma.paymentOrder.upsert({
        where: { appointmentId: appointment.id },
        create: { appointmentId: appointment.id, amount: parsed.data.amount, description: parsed.data.description || null, status: PaymentOrderStatus.PENDING },
        update: { amount: parsed.data.amount, description: parsed.data.description || null },
      });
      return NextResponse.json({ paymentOrder });
    }

    if (parsed.data.action !== "follow-up") return NextResponse.json({ error: "Үйлдлийн төрөл буруу байна." }, { status: 400 });
    const followUpData = parsed.data;
    const date = dateFromValue(followUpData.appointmentDate);
    if (!date) return NextResponse.json({ error: "Огноо буруу байна." }, { status: 400 });
    const followUp = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctor.id}), hashtext(${followUpData.appointmentDate}))`;
      const conflict = await tx.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          appointmentDate: { gte: date, lt: nextDay(date) },
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          startTime: { lt: followUpData.endTime }, endTime: { gt: followUpData.startTime },
        },
      });
      if (conflict) throw new Error("CONFLICT");
      return tx.appointment.create({
        data: { appointmentDate: date, startTime: followUpData.startTime, endTime: followUpData.endTime, patientId: appointment.patientId, doctorId: doctor.id, serviceId: appointment.serviceId, followUpOfId: appointment.id, status: AppointmentStatus.BOOKED },
      });
    });
    publishAppointmentChange({ appointmentId: followUp.id, appointmentDate: followUpData.appointmentDate, doctorId: doctor.id, action: "created" });
    return NextResponse.json({ appointment: followUp }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") return NextResponse.json({ error: "Сонгосон цагт өөр захиалга байна." }, { status: 409 });
    console.error("Doctor appointment action failed:", error);
    return NextResponse.json({ error: "Үйлдлийг хадгалах үед алдаа гарлаа." }, { status: 500 });
  }
}
