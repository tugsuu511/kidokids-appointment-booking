import { CalendarDays, Users, Stethoscope } from "lucide-react";

import { DashboardSchedule } from "@/components/appointments/dashboard-schedule";
import { getDailyAppointments, getDoctorDailySchedules } from "@/lib/appointment-queries";
import { dateFromValue, nextDay, todayValue } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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

export default async function DashboardPage() {
  await requireAuth();
  const initialDate = todayValue();
  const [stats, appointments, doctorSchedules] = await Promise.all([
    getDashboardStats(initialDate),
    getDailyAppointments(initialDate),
    getDoctorDailySchedules(initialDate),
  ]);

  const cards = [
    { title: "Өнөөдрийн цаг", value: stats.todayCount ?? 0, icon: CalendarDays },
    { title: "Захиалсан", value: stats.byStatus.BOOKED ?? 0, icon: Users },
    { title: "Баталгаажсан", value: stats.byStatus.CONFIRMED ?? 0, icon: Stethoscope },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Хяналтын самбар</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ title, value, icon: Icon }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
              </div>
              <div className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <DashboardSchedule initialDate={initialDate} initialAppointments={appointments} initialDoctorSchedules={doctorSchedules} />
    </div>
  );
}
