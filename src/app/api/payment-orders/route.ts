import { AppointmentStatus, PaymentOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { publishAppointmentChange } from "@/lib/appointment-events";
import { prisma } from "@/lib/prisma";

const updatePaymentSchema = z.object({
  id: z.string().min(1),
  status: z.literal(PaymentOrderStatus.PAID),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  if (user.role !== "MANAGER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Төлбөрийн төлөв өөрчлөх эрхгүй байна." }, { status: 403 });
  }

  try {
    const parsed = updatePaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Төлбөрийн төлөвийн мэдээлэл буруу байна." }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.id}))`;
      const current = await tx.paymentOrder.findUnique({
        where: { id: parsed.data.id },
        select: { appointmentId: true, status: true, appointment: { select: { status: true } } },
      });
      if (!current) return null;
      if (current.status === PaymentOrderStatus.CANCELLED) throw new Error("PAYMENT_CANCELLED");
      if (current.status === PaymentOrderStatus.PENDING && current.appointment.status !== AppointmentStatus.COMPLETED) {
        throw new Error("INVALID_APPOINTMENT_STATUS");
      }

      const changed = await tx.paymentOrder.updateMany({
        where: { id: parsed.data.id, status: PaymentOrderStatus.PENDING },
        data: { status: PaymentOrderStatus.PAID },
      });
      if (changed.count === 1) {
        const transitioned = await tx.appointment.updateMany({
          where: { id: current.appointmentId, status: AppointmentStatus.COMPLETED },
          data: { status: AppointmentStatus.PAID },
        });
        if (transitioned.count !== 1) throw new Error("INVALID_APPOINTMENT_STATUS");
      }
      const paymentOrder = await tx.paymentOrder.findUnique({
        where: { id: parsed.data.id },
        select: {
          id: true,
          appointmentId: true,
          amount: true,
          status: true,
          updatedAt: true,
          appointment: { select: { appointmentDate: true, doctorId: true, status: true } },
        },
      });

      if (changed.count === 1 && paymentOrder) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "PAYMENT_ORDER_MARKED_PAID",
            entity: "PaymentOrder",
            entityId: paymentOrder.id,
            details: JSON.stringify({
              appointmentId: paymentOrder.appointmentId,
              amount: paymentOrder.amount.toString(),
              from: PaymentOrderStatus.PENDING,
              to: PaymentOrderStatus.PAID,
            }),
          },
        });
      }

      return { paymentOrder, changed: changed.count === 1 };
    });

    if (!result) return NextResponse.json({ error: "Төлбөрийн даалгавар олдсонгүй." }, { status: 404 });
    if (!result.paymentOrder) return NextResponse.json({ error: "Төлбөрийн даалгавар олдсонгүй." }, { status: 404 });
    if (!result.changed && result.paymentOrder.status !== PaymentOrderStatus.PAID) {
      return NextResponse.json({ error: "Цуцлагдсан төлбөрийг төлөгдсөн болгох боломжгүй." }, { status: 409 });
    }

    if (result.changed) {
      publishAppointmentChange({
        appointmentId: result.paymentOrder.appointmentId,
        appointmentDate: result.paymentOrder.appointment.appointmentDate.toISOString().slice(0, 10),
        doctorId: result.paymentOrder.appointment.doctorId,
        action: "status-updated",
      });
    }

    return NextResponse.json({
      paymentOrder: {
        id: result.paymentOrder.id,
        appointmentId: result.paymentOrder.appointmentId,
        status: result.paymentOrder.status,
        appointmentDate: result.paymentOrder.appointment.appointmentDate.toISOString().slice(0, 10),
        doctorId: result.paymentOrder.appointment.doctorId,
        amount: result.paymentOrder.amount.toString(),
        updatedAt: result.paymentOrder.updatedAt.toISOString(),
        appointmentStatus: result.paymentOrder.appointment.status,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_CANCELLED") {
      return NextResponse.json({ error: "Цуцлагдсан төлбөрийг төлөгдсөн болгох боломжгүй." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVALID_APPOINTMENT_STATUS") {
      return NextResponse.json({ error: "Зөвхөн дууссан үзлэгийн төлбөрийг төлөгдсөн болгоно." }, { status: 409 });
    }
    console.error("Update payment order failed:", error);
    return NextResponse.json({ error: "Төлбөрийн төлөв шинэчлэх үед алдаа гарлаа." }, { status: 500 });
  }
}
