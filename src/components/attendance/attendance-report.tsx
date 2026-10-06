"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { attendanceMonthRange, shiftAttendanceMonth, formatAttendanceDuration } from "@/lib/attendance";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import type { getAttendanceReport } from "@/lib/attendance-queries";
import { roleLabels } from "@/types/staff";

type Report = Awaited<ReturnType<typeof getAttendanceReport>>;
const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const cellClass = "px-4 py-3 text-left";

export function AttendanceReport({ isAdmin, defaults, checkoutError, hasAttendance }: {
  isAdmin: boolean; defaults: { from: string; to: string }; checkoutError: boolean; hasAttendance: boolean;
}) {
  const initialRange = isAdmin ? attendanceMonthRange(defaults.from.slice(0, 7)) ?? defaults : defaults;
  const [month, setMonth] = useState(defaults.from.slice(0, 7));
  const [draft, setDraft] = useState({ ...initialRange, userId: "" });
  const [filters, setFilters] = useState({ ...initialRange, userId: "", calendarMonth: initialRange.from.slice(0, 7) });
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`/api/attendance?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Тайланг ачаалж чадсангүй.");
        if (!controller.signal.aborted) setReport(body);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Тайланг ачаалж чадсангүй.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, revision]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const range = isAdmin ? attendanceMonthRange(month) : draft;
    if (range) setFilters({ from: range.from, to: range.to, userId: draft.userId, calendarMonth: range.from.slice(0, 7) });
  }

  function navigateMonth(offset: number) {
    const nextMonth = shiftAttendanceMonth(month, offset);
    const range = nextMonth && attendanceMonthRange(nextMonth);
    if (!nextMonth || !range) return;
    setMonth(nextMonth);
    setFilters({ ...range, userId: draft.userId, calendarMonth: nextMonth });
  }

  function navigateCalendar(offset: number) {
    const nextMonth = shiftAttendanceMonth(filters.calendarMonth, offset);
    const range = nextMonth && attendanceMonthRange(nextMonth);
    if (!nextMonth || !range) return;
    if (isAdmin) {
      setMonth(nextMonth);
      setDraft((previous) => ({ ...previous, userId: filters.userId }));
      setFilters({ ...range, userId: filters.userId, calendarMonth: nextMonth });
    } else {
      setFilters({ ...filters, calendarMonth: nextMonth });
    }
  }

  const employees = report?.employees ?? [];
  const names = new Map(employees.map((employee) => [employee.id, employee.fullName]));
  const totals = report?.summary.reduce((sum, row) => ({
    durationMs: sum.durationMs + row.durationMs, completed: sum.completed + row.completed, incomplete: sum.incomplete + row.incomplete,
  }), { durationMs: 0, completed: 0, incomplete: 0 });
  const selectedMonthLabel = `${filters.from.slice(0, 4)} оны ${Number(filters.from.slice(5, 7))} сар`;

  return <div className="space-y-6">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Clock3 className="h-6 w-6 text-sky-600" />{isAdmin ? "Ажилчдын цагийн тайлан" : "Миний цагийн тайлан"}</h1>
      <p className="mt-2 text-sm text-slate-600">Системд нэвтрэхэд орсон цаг, «Гарах» товч дарахад гарсан цаг бүртгэгдэнэ. Бүх цаг Улаанбаатарын цагаар харагдана.</p>
    </div>
    {checkoutError ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">Гарсан цагийг хадгалж чадсангүй. Дахин «Гарах» товч дарна уу.</p> : null}
    {!hasAttendance ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Энэ нэвтрэлтэд цагийн бүртгэл эхлээгүй байна. Гараад дахин нэвтэрч цагийн бүртгэлээ эхлүүлнэ үү.</p> : null}
    <form onSubmit={apply} className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {isAdmin ? <label className="grid gap-1 text-sm font-medium">Ажилтан<select aria-label="Ажилтан" value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })} className={`${fieldClass} max-w-80`}>
        <option value="">Бүх ажилтан</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {roleLabels[employee.role]}{employee.isActive ? "" : " (идэвхгүй)"}</option>)}
      </select></label> : null}
      {isAdmin ? <>
        <label className="grid gap-1 text-sm font-medium">Тайлангийн сар
          <input aria-label="Тайлангийн сар" type="month" required min="0001-01" max="9999-12" value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass} />
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={loading || !shiftAttendanceMonth(month, -1)} onClick={() => navigateMonth(-1)} className={`${fieldClass} disabled:opacity-40`}>Өмнөх сар</button>
          <button type="button" disabled={loading || !shiftAttendanceMonth(month, 1)} onClick={() => navigateMonth(1)} className={`${fieldClass} disabled:opacity-40`}>Дараах сар</button>
        </div>
      </> : <>
        <label className="grid gap-1 text-sm font-medium">Эхлэх огноо<input aria-label="Эхлэх огноо" type="date" required value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={fieldClass} /></label>
        <label className="grid gap-1 text-sm font-medium">Дуусах огноо<input aria-label="Дуусах огноо" type="date" required value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={fieldClass} /></label>
      </>}
      <button type="submit" disabled={loading} className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">Тайлан харах</button>
      <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className={`${fieldClass} flex items-center gap-2 disabled:opacity-50`}><RefreshCw className="h-4 w-4" />Шинэчлэх</button>
    </form>
    {isAdmin ? <p className="text-sm text-slate-600">Ажилтан, он, сараа сонгоод «Тайлан харах» дарна уу. «Өмнөх сар», «Дараах сар» товчоор сонгосон ажилтны бусад сарын тайланг шууд харна.</p> : null}
    <p className="text-sm text-slate-500">Нэвтэрсэн огноогоор шүүнэ. Нийт хугацаанд зөвхөн гарсан цагтай бүртгэл орно. Хөтөч хаахад гарах цаг бүртгэгдэхгүй. 24 цагаас хэтэрсэн нээлттэй бүртгэлийг «Гаралт бүртгээгүй» гэж үзэж, нийт хугацаанд оруулахгүй.</p>
    {loading ? <p role="status" className="rounded-xl bg-white p-8 text-center text-slate-500">Цагийн тайланг ачаалж байна...</p> : error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p> : report && totals ? <>
      {isAdmin ? <div className="rounded-xl border border-sky-100 bg-sky-50 px-5 py-4">
        <h2 className="font-semibold text-sky-950">{filters.userId ? names.get(filters.userId) : "Бүх ажилтан"} · {selectedMonthLabel}</h2>
        <p className="mt-1 text-sm text-sky-800">{filters.from} – {filters.to} · Сарын нийт хугацаа болон орсон, гарсан цагийн дэлгэрэнгүй</p>
      </div> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Нийт бүртгэгдсэн хугацаа", formatAttendanceDuration(totals.durationMs)], ["Дууссан бүртгэл", totals.completed], ["Гарсан цаггүй бүртгэл", totals.incomplete]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-sky-900">{value}</p></div>)}
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-4 font-semibold">{isAdmin ? "Ажилтан тус бүрийн нэгтгэл" : "Миний нэгтгэл"}</h2>
        <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>{["Ажилтан", "Нэвтэрсэн өдөр", "Дууссан", "Гарсан цаггүй", "Нийт хугацаа"].map((label) => <th key={label} scope="col" className={cellClass}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{employees.filter((employee) => !filters.userId || employee.id === filters.userId).map((employee) => {
            const row = report.summary.find((summary) => summary.userId === employee.id);
            return <tr key={employee.id}><th scope="row" className={`${cellClass} font-medium`}>{employee.fullName}<span className="ml-2 font-normal text-slate-500">{roleLabels[employee.role]}</span></th><td className={cellClass}>{row?.days ?? 0}</td><td className={cellClass}>{row?.completed ?? 0}</td><td className={cellClass}>{row?.incomplete ?? 0}</td><td className={cellClass}>{formatAttendanceDuration(row?.durationMs ?? 0)}</td></tr>;
          })}</tbody>
        </table></div>
      </section>
      <AttendanceCalendar key={`${filters.from}:${filters.to}:${filters.userId}:${filters.calendarMonth}`}
        month={filters.calendarMonth} from={filters.from} to={filters.to} records={report.records}
        employees={employees} showNames={isAdmin} onMonthChange={navigateCalendar}
        previousDisabled={!shiftAttendanceMonth(filters.calendarMonth, -1) || (!isAdmin && filters.calendarMonth <= filters.from.slice(0, 7))}
        nextDisabled={!shiftAttendanceMonth(filters.calendarMonth, 1) || (!isAdmin && filters.calendarMonth >= filters.to.slice(0, 7))} />
    </> : null}
  </div>;
}
