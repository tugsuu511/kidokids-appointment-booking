import { PaymentOrderStatus } from "@prisma/client";
import { CalendarDays, CreditCard, Stethoscope, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { DashboardSchedule } from "@/components/appointments/dashboard-schedule";
import { PaymentOrdersPanel, type PaymentOrderItem } from "@/components/payments/payment-orders-panel";
import { getDailyAppointments, getDoctorDailySchedules } from "@/lib/appointment-queries";
import { requireAuth } from "@/lib/auth";
import { dateFromValue, nextDay, todayValue } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

function money(value: { toString(): string } | number) {
  return new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value.toString()));
}

async function getDashboardStats(dateValue: string) {
  const today = dateFromValue(dateValue)!;
  const appointmentDate = { gte: today, lt: nextDay(today) };

  const [totals, todayCount] = await Promise.all([
    prisma.appointment.groupBy({
      where: { appointmentDate },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: { appointmentDate },
    }),
  ]);

  return {
    byStatus: Object.fromEntries(totals.map((item) => [item.status, item._count._all])),
    todayCount,
  };
}

async function getManagerPayments() {
  const [orders, pending] = await Promise.all([
    prisma.paymentOrder.findMany({
      orderBy: { updatedAt: "desc" },
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
      where: { status: PaymentOrderStatus.PENDING },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  return { orders, pending };
}

export default async function DashboardPage() {
  const user = await requireAuth();
  if (user.role === "DOCTOR") redirect("/doctor");

  const initialDate = todayValue();
  const [stats, appointments, doctorSchedules, payments] = await Promise.all([
    getDashboardStats(initialDate),
    getDailyAppointments(initialDate),
    getDoctorDailySchedules(initialDate),
    user.role === "ADMIN" || user.role === "MANAGER" ? getManagerPayments() : Promise.resolve(null),
  ]);

  const cards = [
    { title: "Өнөөдрийн цаг", value: stats.todayCount ?? 0, icon: CalendarDays },
    { title: "Захиалсан", value: stats.byStatus.BOOKED ?? 0, icon: Users },
    { title: "Баталгаажсан", value: stats.byStatus.CONFIRMED ?? 0, icon: Stethoscope },
    ...(payments
      ? [{
          title: "Хүлээгдэж буй төлбөр",
          value: payments.pending._count._all,
          detail: `${money(payments.pending._sum.amount ?? 0)} ₮`,
          icon: CreditCard,
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Хяналтын самбар</h1>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 ${payments ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {cards.map(({ title, value, icon: Icon, ...card }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                {card.detail ? <p className="mt-1 text-sm font-medium text-slate-600">{card.detail}</p> : null}
              </div>
              <div className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {payments ? (
        <PaymentOrdersPanel
          initialPendingCount={payments.pending._count._all}
          initialOrders={payments.orders.map((order): PaymentOrderItem => ({
            ...order,
            amount: order.amount.toString(),
            updatedAt: order.updatedAt.toISOString(),
            appointment: {
              ...order.appointment,
              appointmentDate: order.appointment.appointmentDate.toISOString().slice(0, 10),
            },
          }))}
        />
      ) : null}

      <DashboardSchedule initialDate={initialDate} initialAppointments={appointments} initialDoctorSchedules={doctorSchedules} />
    </div>
  );
}
