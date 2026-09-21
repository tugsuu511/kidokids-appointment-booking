import { CalendarDays, Users, Stethoscope, Building2 } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totals, todayCount, doctors, departments] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: { appointmentDate: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } },
    }),
    prisma.doctor.count({ where: { isActive: true } }),
    prisma.department.count({ where: { isActive: true } }),
  ]);

  return {
    totalAppointments: totals.reduce((sum, item) => sum + item._count._all, 0),
    activeDoctors: doctors,
    activeDepartments: departments,
    byStatus: Object.fromEntries(totals.map((item) => [item.status, item._count._all])),
    todayCount,
  };
}

export default async function DashboardPage() {
  await requireAuth();
  const stats = await getDashboardStats();

  const cards = [
    { title: "Өнөөдрийн цаг", value: stats.todayCount ?? 0, icon: CalendarDays },
    { title: "Захиалсан", value: stats.byStatus.BOOKED ?? 0, icon: Users },
    { title: "Баталгаажсан", value: stats.byStatus.CONFIRMED ?? 0, icon: Stethoscope },
    { title: "Эмчид бүртгэлтэй", value: stats.activeDoctors, icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Хяналтын самбар</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
    </div>
  );
}
