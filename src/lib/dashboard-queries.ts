import "server-only";

import { dateFromValue, nextDay } from "@/lib/appointments";
import type { DashboardSummaryData } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

export async function getDashboardSummary(date: string): Promise<DashboardSummaryData> {
  const day = dateFromValue(date);
  if (!day) throw new Error("Invalid dashboard date");

  const [totals, orders, pending] = await Promise.all([
    prisma.appointment.groupBy({
      where: { appointmentDate: { gte: day, lt: nextDay(day) } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.paymentOrder.findMany({
      relationLoadStrategy: "join",
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        amount: true,
        description: true,
        status: true,
        updatedAt: true,
        appointment: {
          select: {
            appointmentDate: true,
            status: true,
            patient: { select: { firstName: true, lastName: true, phone: true } },
            doctor: { select: { fullName: true } },
            service: { select: { name: true } },
          },
        },
      },
    }),
    prisma.paymentOrder.aggregate({
      where: { status: "PENDING" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  return {
    date,
    todayCount: totals.reduce((count, item) => count + item._count._all, 0),
    byStatus: Object.fromEntries(totals.map((item) => [item.status, item._count._all])),
    pendingCount: pending._count._all,
    pendingAmount: pending._sum.amount?.toString() ?? "0",
    orders: orders.map((order) => ({
      ...order,
      amount: order.amount.toString(),
      updatedAt: order.updatedAt.toISOString(),
      appointment: {
        ...order.appointment,
        appointmentDate: order.appointment.appointmentDate.toISOString().slice(0, 10),
      },
    })),
  };
}
