import { dateFromValue, nextDay, type Appointment, type DoctorDailySchedule } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import "server-only";

export async function getDailyAppointments(value: string, doctorId?: string): Promise<Appointment[]> {
  const date = dateFromValue(value);
  if (!date) throw new Error("Invalid appointment date");

  const appointments = await prisma.appointment.findMany({
    relationLoadStrategy: "join",
    where: { appointmentDate: { gte: date, lt: nextDay(date) }, ...(doctorId ? { doctorId } : {}) },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      appointmentDate: true,
      startTime: true,
      endTime: true,
      status: true,
      patient: {
        select: {
          id: true,
          registerNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          birthDate: true,
          gender: true,
          address: true,
          notes: true,
        },
      },
      doctor: { select: { id: true, fullName: true } },
      service: { select: { name: true, price: true } },
      visitRecord: { select: { note: true, updatedAt: true } },
      paymentOrder: { select: { id: true, amount: true, status: true, description: true } },
    },
  });

  return appointments.map((appointment) => ({
    ...appointment,
    appointmentDate: appointment.appointmentDate.toISOString(),
    patient: {
      ...appointment.patient,
      birthDate: appointment.patient.birthDate?.toISOString().slice(0, 10) ?? null,
    },
    visitRecord: appointment.visitRecord ? { ...appointment.visitRecord, updatedAt: appointment.visitRecord.updatedAt.toISOString() } : null,
    paymentOrder: appointment.paymentOrder ? { ...appointment.paymentOrder, amount: appointment.paymentOrder.amount.toString() } : null,
    service: { ...appointment.service, price: appointment.service.price.toString() },
  }));
}

export async function getDoctorDailySchedules(value: string): Promise<DoctorDailySchedule[]> {
  const date = dateFromValue(value);
  if (!date) throw new Error("Invalid appointment date");

  return prisma.doctor.findMany({
    relationLoadStrategy: "join",
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
