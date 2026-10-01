import type { Prisma } from "@prisma/client";
import "server-only";

import { getDoctorForUser } from "@/lib/doctor-access";
import type { PatientDetails, PatientsPage } from "@/lib/patients";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/types/auth";

const patientProfileSelect = {
  id: true,
  registerNo: true,
  firstName: true,
  lastName: true,
  phone: true,
  birthDate: true,
  gender: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

export async function getPatientAccessWhere(user: SessionUser): Promise<Prisma.PatientWhereInput | null> {
  if (user.role === "ADMIN") return {};
  if (user.role !== "DOCTOR") return null;

  const doctor = await getDoctorForUser(user);
  if (!doctor) return null;
  return { appointments: { some: { doctorId: doctor.id } } };
}

function serializeProfile<T extends { birthDate: Date | null; createdAt: Date; updatedAt: Date }>(patient: T) {
  return {
    ...patient,
    birthDate: patient.birthDate?.toISOString().slice(0, 10) ?? null,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
  };
}

export async function listPatientsForUser(user: SessionUser, query = "", requestedPage = 1): Promise<PatientsPage | null> {
  const accessWhere = await getPatientAccessWhere(user);
  if (!accessWhere) return null;

  const search = query.trim();
  const where: Prisma.PatientWhereInput = {
    AND: [
      accessWhere,
      ...(search
        ? [{
            OR: [
              { id: { contains: search, mode: "insensitive" as const } },
              { registerNo: { contains: search, mode: "insensitive" as const } },
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
            ],
          }]
        : []),
    ],
  };

  const pageSize = 20;
  const requested = Math.max(1, requestedPage);
  const getPage = (page: number) => prisma.patient.findMany({
    relationLoadStrategy: "join",
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      ...patientProfileSelect,
      _count: { select: { appointments: true } },
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        take: 1,
        select: { appointmentDate: true },
      },
    },
  });

  // Most navigations open page one. Fetch it alongside the count, but clamp
  // later pages before issuing OFFSET (including arbitrarily large input).
  const [total, firstPage] = await Promise.all([
    prisma.patient.count({ where }),
    requested === 1 ? getPage(1) : Promise.resolve(null),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, totalPages);
  const patients = firstPage ?? await getPage(page);

  return {
    patients: patients.map(({ _count, appointments, ...patient }) => ({
      ...serializeProfile(patient),
      appointmentCount: _count.appointments,
      lastAppointmentAt: appointments[0]?.appointmentDate.toISOString() ?? null,
    })),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getPatientDetailsForUser(user: SessionUser, patientId: string): Promise<PatientDetails | null | undefined> {
  const accessWhere = await getPatientAccessWhere(user);
  if (!accessWhere) return undefined;

  const patient = await prisma.patient.findFirst({
    relationLoadStrategy: "join",
    where: { AND: [{ id: patientId }, accessWhere] },
    select: {
      ...patientProfileSelect,
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        take: 25,
        select: {
          id: true,
          appointmentDate: true,
          startTime: true,
          endTime: true,
          status: true,
          doctor: { select: { fullName: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!patient) return null;
  return {
    ...serializeProfile(patient),
    appointments: patient.appointments.map((appointment) => ({
      ...appointment,
      appointmentDate: appointment.appointmentDate.toISOString(),
    })),
  };
}
