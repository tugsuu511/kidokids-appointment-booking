"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { attendanceDate, attendanceMonthRange, ATTENDANCE_TIME_ZONE, formatAttendanceDuration } from "@/lib/attendance";

type AttendanceRecord = {
  id: string; userId: string; checkIn: string; checkOut: string | null; missedCheckOut: boolean;
};
const weekdays = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];
const clockTime = new Intl.DateTimeFormat("mn-MN", {
  timeZone: ATTENDANCE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dateTime = new Intl.DateTimeFormat("mn-MN", {
  timeZone: ATTENDANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function duration(record: AttendanceRecord) {
  return record.checkOut ? Date.parse(record.checkOut) - Date.parse(record.checkIn) : 0;
}

function status(record: AttendanceRecord) {
  if (record.checkOut) return { label: "Дууссан", color: "bg-emerald-50 text-emerald-800" };
  if (record.missedCheckOut) return { label: "Гаралт бүртгээгүй", color: "bg-amber-50 text-amber-800" };
  return { label: "Нээлттэй", color: "bg-sky-50 text-sky-800" };
}

function exitTime(record: AttendanceRecord) {
  if (!record.checkOut) return "—";
  const dayDifference = Math.round((Date.parse(attendanceDate(new Date(record.checkOut))) -
    Date.parse(attendanceDate(new Date(record.checkIn)))) / 86400000);
  return `${clockTime.format(new Date(record.checkOut))}${dayDifference > 0 ? ` (+${dayDifference} өдөр)` : ""}`;
}

export function AttendanceCalendar({ month, from, to, records, employees, showNames, onMonthChange, previousDisabled, nextDisabled }: {
  month: string; from: string; to: string; records: AttendanceRecord[];
  employees: { id: string; fullName: string }[]; showNames: boolean;
  onMonthChange: (offset: number) => void; previousDisabled: boolean; nextDisabled: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const monthRange = attendanceMonthRange(month)!;
  const offset = (new Date(`${monthRange.from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Number(monthRange.to.slice(8));
  const weekCount = Math.ceil((offset + days) / 7);
  const names = new Map(employees.map((employee) => [employee.id, employee.fullName]));
  const byDate = new Map<string, AttendanceRecord[]>();
  for (const record of [...records].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.id.localeCompare(b.id))) {
    const date = attendanceDate(new Date(record.checkIn));
    const entries = byDate.get(date) ?? [];
    entries.push(record);
    byDate.set(date, entries);
  }
  const selectedRecords = selectedDate ? byDate.get(selectedDate) ?? [] : [];
  const monthLabel = `${month.slice(0, 4)} оны ${Number(month.slice(5))} сар`;

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        <h2 className="font-semibold">Орсон, гарсан цагийн дэлгэрэнгүй</h2>
        <p className="mt-1 text-sm text-slate-500">Өдрөө дарж бүх бүртгэлийг дэлгэрэнгүй харна. Орсон цаг → Гарсан цаг</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Календарийн өмнөх сар" disabled={previousDisabled} onClick={() => onMonthChange(-1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="min-w-36 text-center text-sm font-semibold">{monthLabel}</h3>
        <button type="button" aria-label="Календарийн дараах сар" disabled={nextDisabled} onClick={() => onMonthChange(1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] table-fixed border-collapse text-sm">
        <caption className="sr-only">{monthLabel} цаг бүртгэлийн календарь</caption>
        <thead><tr>{weekdays.map((day, index) => <th key={day} scope="col" className={`border-b border-slate-200 py-3 font-medium ${index >= 5 ? "bg-sky-50 text-sky-800" : "bg-slate-50 text-slate-600"}`}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: weekCount }, (_, week) => <tr key={week}>
          {Array.from({ length: 7 }, (_, weekday) => {
            const day = week * 7 + weekday - offset + 1;
            if (day < 1 || day > days) return <td key={weekday} className="border border-slate-100 bg-slate-50/70" />;
            const date = `${month}-${String(day).padStart(2, "0")}`;
            const outsideRange = date < from || date > to;
            const entries = byDate.get(date) ?? [];
            const total = entries.reduce((sum, entry) => sum + duration(entry), 0);
            const selected = selectedDate === date;
            return <td key={weekday} className="border border-slate-200 p-0 align-top">
              <button type="button" disabled={outsideRange} aria-label={`${date}, ${entries.length} бүртгэл`} aria-pressed={selected}
                onClick={() => setSelectedDate(date)} className={`flex min-h-44 w-full flex-col gap-2 p-3 text-left transition focus-visible:outline-2 focus-visible:outline-sky-600 ${selected ? "bg-sky-50 ring-2 ring-inset ring-sky-500" : "hover:bg-slate-50"} ${outsideRange ? "bg-slate-50 text-slate-300" : "text-slate-700"}`}>
                <span className="flex w-full items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-full font-semibold ${selected ? "bg-sky-600 text-white" : ""}`}>{day}</span>{entries.length > 0 ? <span className="text-xs text-slate-500">{entries.length} бүртгэл</span> : null}</span>
                {entries.length ? <>
                  {entries.slice(0, 2).map((entry) => {
                    const state = status(entry);
                    return <span key={entry.id} className={`block w-full rounded-md px-2 py-1.5 text-xs ${state.color}`}>
                      {showNames ? <span className="mb-1 block truncate font-medium">{names.get(entry.userId)}</span> : null}
                      <span className="block font-medium">{clockTime.format(new Date(entry.checkIn))} → {exitTime(entry)}</span>
                      {!entry.checkOut ? <span className="mt-1 block">{state.label}</span> : null}
                    </span>;
                  })}
                  {entries.length > 2 ? <span className="text-xs font-medium text-sky-700">Нэмж {entries.length - 2} бүртгэл</span> : null}
                  <span className="mt-auto pt-1 text-xs font-semibold">Нийт {formatAttendanceDuration(total)}</span>
                </> : <span className="mt-3 text-xs text-slate-400">{outsideRange ? "—" : "Бүртгэлгүй"}</span>}
              </button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
      <span>Энэ сард {records.length} бүртгэл</span>
      {[{ label: "Дууссан", color: "bg-emerald-500" }, { label: "Нээлттэй", color: "bg-sky-500" }, { label: "Гаралт бүртгээгүй", color: "bg-amber-500" }].map((state) => <span key={state.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${state.color}`} />{state.label}</span>)}
    </div>
    {!records.length ? <p className="border-t border-slate-100 p-4 text-sm text-slate-500">Сонгосон сард цагийн бүртгэл алга.</p> : null}
    {selectedDate ? <div className="border-t border-slate-200 bg-slate-50 p-4" aria-live="polite">
      <h3 className="font-semibold">{selectedDate} · Өдрийн дэлгэрэнгүй</h3>
      <p className="mt-1 text-sm text-slate-600">{selectedRecords.length} бүртгэл · Нийт {formatAttendanceDuration(selectedRecords.reduce((sum, entry) => sum + duration(entry), 0))}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{selectedRecords.map((entry) => {
        const state = status(entry);
        return <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {showNames ? <h4 className="font-medium">{names.get(entry.userId)}</h4> : null}
            <span className={`rounded-full px-2 py-1 text-xs ${state.color}`}>{state.label}</span>
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Орсон цаг</dt><dd>{dateTime.format(new Date(entry.checkIn))}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Гарсан цаг</dt><dd>{entry.checkOut ? dateTime.format(new Date(entry.checkOut)) : "—"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Хугацаа</dt><dd className="font-medium">{entry.checkOut ? formatAttendanceDuration(duration(entry)) : "—"}</dd></div>
          </dl>
        </article>;
      })}</div>
      {!selectedRecords.length ? <p className="mt-3 text-sm text-slate-500">Энэ өдөр цагийн бүртгэл алга.</p> : null}
    </div> : null}
  </section>;
}
