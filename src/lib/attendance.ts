import { z } from "zod";

export const ATTENDANCE_TIME_ZONE = "Asia/Ulaanbaatar";
export const MAX_ATTENDANCE_MS = 24 * 60 * 60 * 1000;
export const ATTENDANCE_PAGE_SIZE = 50;

export function attendanceDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function attendanceDefaults(now = new Date()) {
  const to = attendanceDate(now);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function attendanceMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1) return null;
  const from = `${month}-01`;
  const lastDay = new Date(`${from}T00:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  return { from, to: lastDay.toISOString().slice(0, 10) };
}

export function shiftAttendanceMonth(month: string, offset: number) {
  if (!attendanceMonthRange(month)) return null;
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset;
  const year = Math.floor(index / 12);
  if (year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

const dateSchema = z.iso.date();
export const attendanceFilterSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  userId: z.string().max(128).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  calendarMonth: z.string().refine((month) => attendanceMonthRange(month) !== null).optional(),
}).refine(({ from, to }) => from <= to, { message: "Эхлэх огноо дуусах огнооноос хойш байж болохгүй." })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) < 366 * MAX_ATTENDANCE_MS, {
    message: "Тайлангийн хугацаа 366 хоногоос хэтрэхгүй байна.",
  });

// Calendar requests contain every record in one visible month, clipped to the report range.
export function attendanceRecordRange(from: string, to: string, calendarMonth?: string) {
  const range = attendanceRange(from, to);
  if (!calendarMonth) return range;
  const month = attendanceMonthRange(calendarMonth);
  if (!month) throw new Error("Invalid calendar month");
  const monthRange = attendanceRange(month.from, month.to);
  return {
    start: new Date(Math.max(range.start.getTime(), monthRange.start.getTime())),
    end: new Date(Math.min(range.end.getTime(), monthRange.end.getTime())),
  };
}

export function attendanceRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00+08:00`),
    end: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + MAX_ATTENDANCE_MS),
  };
}

export function formatAttendanceDuration(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60000);
  return `${Math.floor(minutes / 60)} цаг ${minutes % 60} мин`;
}
