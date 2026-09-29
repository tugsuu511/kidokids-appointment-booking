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
  z.object({
    action: z.literal("complete"),
    appointmentId: z.string().min(1),
    note: z.string().trim().min(1).max(4000),
    amount: z.coerce.number().positive().max(100_000_000),
    description: z.string().trim().max(500).optional(),
    scheduleFollowUp: z.boolean(),
    appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: time.optional(),
    endTime: time.optional(),
  }),
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

    if (parsed.data.action === "complete") {
      const data = parsed.data;
      if (appointment.status !== AppointmentStatus.ARRIVED) {
        return NextResponse.json({ error: "Үзлэгийг зөвхөн ‘Ирсэн’ төлөвөөс дуусгана." }, { status: 409 });
      }
      const followUpDate = data.scheduleFollowUp && data.appointmentDate
        ? dateFromValue(data.appointmentDate)
        : null;

      if (data.scheduleFollowUp && (!followUpDate || !data.startTime || !data.endTime)) {
        return NextResponse.json({ error: "Давтан үзлэгийн огноо, эхлэх болон дуусах цагийг бүрэн оруулна уу." }, { status: 400 });
      }
      if (data.scheduleFollowUp && data.startTime! >= data.endTime!) {
        return NextResponse.json({ error: "Дуусах цаг эхлэх цагаас хойш байх ёстой." }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const transitioned = await tx.appointment.updateMany({
          where: { id: appointment.id, status: AppointmentStatus.ARRIVED },
          data: { status: AppointmentStatus.COMPLETED },
        });
        if (transitioned.count !== 1) throw new Error("INVALID_TRANSITION");

        if (data.scheduleFollowUp) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctor.id}), hashtext(${data.appointmentDate!}))`;
          const conflict = await tx.appointment.findFirst({
            where: {
              doctorId: doctor.id,
              appointmentDate: { gte: followUpDate!, lt: nextDay(followUpDate!) },
              status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
              startTime: { lt: data.endTime! },
              endTime: { gt: data.startTime! },
            },
          });
          if (conflict) throw new Error("CONFLICT");
        }

        const visitRecord = await tx.visitRecord.upsert({
          where: { appointmentId: appointment.id },
          create: { appointmentId: appointment.id, doctorId: doctor.id, note: data.note },
          update: { note: data.note },
        });
        const paymentOrder = await tx.paymentOrder.upsert({
          where: { appointmentId: appointment.id },
          create: { appointmentId: appointment.id, amount: data.amount, description: data.description || null, status: PaymentOrderStatus.PENDING },
          update: { amount: data.amount, description: data.description || null },
        });
        const completedAppointment = await tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
        const followUp = data.scheduleFollowUp
          ? await tx.appointment.create({
              data: {
                appointmentDate: followUpDate!,
                startTime: data.startTime!,
                endTime: data.endTime!,
                patientId: appointment.patientId,
                doctorId: doctor.id,
                serviceId: appointment.serviceId,
                followUpOfId: appointment.id,
                status: AppointmentStatus.BOOKED,
              },
            })
          : null;

        return { visitRecord, paymentOrder, appointment: completedAppointment, followUp };
      });

      publishAppointmentChange({
        appointmentId: appointment.id,
        appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
        doctorId: doctor.id,
        action: "status-updated",
      });
      if (result.followUp) {
        publishAppointmentChange({
          appointmentId: result.followUp.id,
          appointmentDate: data.appointmentDate!,
          doctorId: doctor.id,
          action: "created",
        });
      }
      return NextResponse.json(result, { status: result.followUp ? 201 : 200 });
    }

    if (parsed.data.action === "visit") {
      if (appointment.status !== AppointmentStatus.ARRIVED && appointment.status !== AppointmentStatus.COMPLETED && appointment.status !== AppointmentStatus.PAID) {
        return NextResponse.json({ error: "Үзлэгийн тэмдэглэлийг өвчтөн ирсний дараа хадгална." }, { status: 409 });
      }
      const visitRecord = await prisma.visitRecord.upsert({
        where: { appointmentId: appointment.id },
        create: { appointmentId: appointment.id, doctorId: doctor.id, note: parsed.data.note },
        update: { note: parsed.data.note },
      });
      return NextResponse.json({ visitRecord });
    }

    if (parsed.data.action === "payment") {
      if (appointment.status !== AppointmentStatus.COMPLETED) {
        return NextResponse.json({ error: "Төлбөрийн даалгаврыг зөвхөн дууссан үзлэгт шинэчилнэ." }, { status: 409 });
      }
      const paymentOrder = await prisma.paymentOrder.upsert({
        where: { appointmentId: appointment.id },
        create: { appointmentId: appointment.id, amount: parsed.data.amount, description: parsed.data.description || null, status: PaymentOrderStatus.PENDING },
        update: { amount: parsed.data.amount, description: parsed.data.description || null },
      });
      publishAppointmentChange({
        appointmentId: appointment.id,
        appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
        doctorId: doctor.id,
        action: "payment-updated",
      });
      return NextResponse.json({ paymentOrder });
    }

    if (parsed.data.action !== "follow-up") return NextResponse.json({ error: "Үйлдлийн төрөл буруу байна." }, { status: 400 });
    if (appointment.status !== AppointmentStatus.COMPLETED && appointment.status !== AppointmentStatus.PAID) {
      return NextResponse.json({ error: "Давтан үзлэгийг үндсэн үзлэг дууссаны дараа товлоно." }, { status: 409 });
    }
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
    if (error instanceof Error && error.message === "INVALID_TRANSITION") return NextResponse.json({ error: "Цагийн төлөв өөрчлөгдсөн байна. Жагсаалтаа шинэчлээд дахин оролдоно уу." }, { status: 409 });
    if (error instanceof Error && error.message === "CONFLICT") return NextResponse.json({ error: "Сонгосон цагт өөр захиалга байна." }, { status: 409 });
    console.error("Doctor appointment action failed:", error);
    return NextResponse.json({ error: "Үйлдлийг хадгалах үед алдаа гарлаа." }, { status: 500 });
  }
}
