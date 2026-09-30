export const patientGenderValues = ["MALE", "FEMALE", "OTHER"] as const;

export type PatientGenderValue = (typeof patientGenderValues)[number];

export const patientGenderLabels: Record<PatientGenderValue, string> = {
  MALE: "Эрэгтэй",
  FEMALE: "Эмэгтэй",
  OTHER: "Бусад",
};

export type PatientProfile = {
  id: string;
  registerNo: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string | null;
  gender: PatientGenderValue | null;
  address: string | null;
  notes: string | null;
};

export type PatientListItem = PatientProfile & {
  createdAt: string;
  updatedAt: string;
  appointmentCount: number;
  lastAppointmentAt: string | null;
};

export type PatientsPage = {
  patients: PatientListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PatientAppointmentHistoryItem = {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "COMPLETED" | "PAID" | "CANCELLED" | "NO_SHOW";
  doctor: { fullName: string };
  service: { name: string };
};

export type PatientDetails = PatientProfile & {
  createdAt: string;
  updatedAt: string;
  appointments: PatientAppointmentHistoryItem[];
};

export function normalizeRegisterNo(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function calculateAge(birthDate: string | null | undefined, onDate = new Date()) {
  if (!birthDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  let age = onDate.getFullYear() - year;
  const hasHadBirthday = onDate.getMonth() + 1 > month || (onDate.getMonth() + 1 === month && onDate.getDate() >= day);
  if (!hasHadBirthday) age -= 1;
  return age >= 0 && age <= 150 ? age : null;
}
