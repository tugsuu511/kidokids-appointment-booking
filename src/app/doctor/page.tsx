import { DoctorWorkspace } from "@/components/doctors/doctor-workspace";
import { getDailyAppointments } from "@/lib/appointment-queries";
import { getDoctorForUser } from "@/lib/doctor-access";
import { requireRole } from "@/lib/auth";
import { todayValue } from "@/lib/appointments";

export default async function DoctorPage() {
  const user = await requireRole("DOCTOR");
  const doctor = await getDoctorForUser(user);
  if (!doctor) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Таны нэвтрэх эрх эмчийн бүртгэлтэй холбогдоогүй байна. Админ эмчийн профайлтай холбож өгнө үү.</div>;

  const initialDate = todayValue();
  const appointments = await getDailyAppointments(initialDate, doctor.id);
  return <DoctorWorkspace initialDate={initialDate} initialAppointments={appointments} doctorName={doctor.fullName} />;
}
