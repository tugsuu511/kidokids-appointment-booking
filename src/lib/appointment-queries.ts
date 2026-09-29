import { dateFromValue, nextDay, type Appointment, type DoctorDailySchedule } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

export async function getDailyAppointments(value: string): Promise<Appointment[]> {
  const date = dateFromValue(value);
  if (!date) throw new Error("Invalid appointment date");

  const appointments = await prisma.appointment.findMany({
    where: { appointmentDate: { gte: date, lt: nextDay(date) } },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      appointmentDate: true,
      startTime: true,
      endTime: true,
      status: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      service: { select: { name: true } },
    },
  });

  return appointments.map((appointment) => ({
    ...appointment,
    appointmentDate: appointment.appointmentDate.toISOString(),
  }));
}

export async function getDoctorDailySchedules(value: string): Promise<DoctorDailySchedule[]> {
  const date = dateFromValue(value);
  if (!date) throw new Error("Invalid appointment date");

  return prisma.doctor.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      appointments: {
        where: {
          appointmentDate: { gte: date, lt: nextDay(date) },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        select: { id: true, startTime: true, endTime: true },
      },
    },
  });
}
