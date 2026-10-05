import { DashboardSchedule } from "@/components/appointments/dashboard-schedule";
import { DashboardSummary } from "@/components/appointments/dashboard-summary";
import { getDailyAppointments, getDoctorDailySchedules } from "@/lib/appointment-queries";
import { requireRole } from "@/lib/auth";
import { todayValue } from "@/lib/appointments";
import { getDashboardSummary } from "@/lib/dashboard-queries";

export default async function DashboardPage() {
  await requireRole("ADMIN", "MANAGER");

  const initialDate = todayValue();
  const [summary, appointments, doctorSchedules] = await Promise.all([
    getDashboardSummary(initialDate),
    getDailyAppointments(initialDate),
    getDoctorDailySchedules(initialDate),
  ]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-slate-900">Хяналтын самбар</h1></div>
      <DashboardSummary initialData={summary} />
      <DashboardSchedule initialDate={initialDate} initialAppointments={appointments} initialDoctorSchedules={doctorSchedules} />
    </div>
  );
}
