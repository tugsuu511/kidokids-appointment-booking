import { requireAuth } from "@/lib/auth";
import { getDailyAppointments } from "@/lib/appointment-queries";
import { todayValue } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

import { AppointmentsClient } from "./appointments-client";

export default async function AppointmentsPage() {
  await requireAuth();
  const initialDate = todayValue();

  const [appointments, doctors, services] = await Promise.all([
    getDailyAppointments(initialDate),
    prisma.doctor.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.service.findMany({ where: { isActive: true, name: { not: "Дархлаажуулалтын зөвлөгөө" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <AppointmentsClient initialDate={initialDate} initialAppointments={appointments} doctors={doctors.map((doctor) => ({ id: doctor.id, label: doctor.fullName }))} services={services.map((service) => ({ id: service.id, label: service.name }))} />;
}
