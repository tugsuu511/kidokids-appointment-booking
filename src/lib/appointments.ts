export const appointmentStatusValues = [
  "BOOKED",
  "CONFIRMED",
  "ARRIVED",
  "COMPLETED",
  "PAID",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type AppointmentStatusValue = (typeof appointmentStatusValues)[number];

export type Appointment = {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatusValue;
  patient: {
    id: string;
    registerNo: string | null;
    firstName: string;
    lastName: string;
    phone: string;
    birthDate: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | null;
    address: string | null;
    notes: string | null;
  };
  doctor: { id: string; fullName: string };
  service: { name: string; price?: string };
  visitRecord?: { note: string; updatedAt: string } | null;
  paymentOrder?: { id: string; amount: string; status: string; description: string | null } | null;
};

export type DoctorDailySchedule = {
  id: string;
  fullName: string;
  appointments: { id: string; startTime: string; endTime: string }[];
};

export const statusLabels: Record<AppointmentStatusValue, string> = {
  BOOKED: "Захиалсан",
  CONFIRMED: "Баталгаажсан",
  ARRIVED: "Ирсэн",
  COMPLETED: "Дууссан",
  PAID: "Төлбөр төлөгдсөн",
  CANCELLED: "Цуцалсан",
  NO_SHOW: "Ирээгүй",
};

export const statusStyles: Record<AppointmentStatusValue, string> = {
  BOOKED: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-cyan-50 text-cyan-700",
  ARRIVED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  PAID: "bg-teal-50 text-teal-700",
  CANCELLED: "bg-red-50 text-red-700",
  NO_SHOW: "bg-slate-100 text-slate-600",
};

const appointmentStatusTransitions: Record<AppointmentStatusValue, readonly AppointmentStatusValue[]> = {
  BOOKED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["COMPLETED"],
  COMPLETED: ["PAID"],
  PAID: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointmentStatus(current: AppointmentStatusValue, next: AppointmentStatusValue) {
  return current === next || appointmentStatusTransitions[current].includes(next);
}

export function appointmentStatusOptions(current: AppointmentStatusValue) {
  return [current, ...appointmentStatusTransitions[current]];
}

export function manuallySelectableAppointmentStatusOptions(current: AppointmentStatusValue) {
  return appointmentStatusOptions(current).filter(
    (status) => status === current || (status !== "COMPLETED" && status !== "PAID"),
  );
}

export function todayValue() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateFromValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function nextDay(date: Date) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

export function shiftDate(value: string, days: number) {
  const date = dateFromValue(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatAppointmentDate(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}
