"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { appointmentChangedEventName, type AppointmentChangeEvent } from "@/components/appointments/appointment-realtime-listener";
import { Input } from "@/components/ui/input";
import {
  dateFromValue,
  formatAppointmentDate,
  manuallySelectableAppointmentStatusOptions,
  shiftDate,
  statusLabels,
  statusStyles,
  todayValue,
  type Appointment,
  type AppointmentStatusValue,
  type DoctorDailySchedule,
} from "@/lib/appointments";

type DayResult = { date: string; appointments: Appointment[]; error: string };

export function DailyAppointments({ initialDate, initialAppointments, selectedDate, refreshVersion = 0, editable = false, onStatusChange, onDateChange, onDoctorSchedulesChange }: {
  initialDate: string;
  initialAppointments: Appointment[];
  selectedDate?: string;
  refreshVersion?: number;
  editable?: boolean;
  onStatusChange?: (id: string, status: AppointmentStatusValue) => void;
  onDateChange?: (date: string) => void;
  onDoctorSchedulesChange?: (date: string, schedules: DoctorDailySchedule[]) => void;
}) {
  const [internalDate, setInternalDate] = useState(initialDate);
  const date = selectedDate ?? internalDate;
  const [result, setResult] = useState<DayResult>({ date: initialDate, appointments: initialAppointments, error: "" });
  const [revision, setRevision] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState("");
  const initialRequest = useRef({ date: initialDate, refreshVersion });
  const hasRequestedData = useRef(false);
  const currentResult = result.date === date ? result : null;
  const appointments = (currentResult?.appointments ?? []).filter((appointment) => appointment.appointmentDate.slice(0, 10) === date);

  useEffect(() => {
    // SSR already supplied this snapshot. This also survives Strict Mode's
    // effect replay; returning to the initial day after navigation still loads.
    if (!hasRequestedData.current && date === initialRequest.current.date &&
      refreshVersion === initialRequest.current.refreshVersion && revision === 0) return;
    hasRequestedData.current = true;
    const controller = new AbortController();
    void fetch(`/api/appointments?date=${encodeURIComponent(date)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Захиалгын жагсаалт авахад алдаа гарлаа.");
        if (!controller.signal.aborted) {
          setResult({ date, appointments: data.appointments, error: "" });
          if (onDoctorSchedulesChange && Array.isArray(data.doctorSchedules)) onDoctorSchedulesChange(date, data.doctorSchedules);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({
          date,
          appointments: previous.date === date ? previous.appointments : [],
          error: error instanceof Error ? error.message : "Захиалгын жагсаалт авахад алдаа гарлаа.",
        }));
      });
    return () => controller.abort();
  }, [date, onDoctorSchedulesChange, refreshVersion, revision]);

  useEffect(() => {
    const onAppointmentChanged = (event: Event) => {
      const change = (event as CustomEvent<AppointmentChangeEvent>).detail;
      if (change?.appointmentDate === date) setRevision((value) => value + 1);
    };
    window.addEventListener(appointmentChangedEventName, onAppointmentChanged);
    return () => window.removeEventListener(appointmentChangedEventName, onAppointmentChanged);
  }, [date]);

  function changeDate(value: string) {
    if (!dateFromValue(value)) return;
    if (selectedDate === undefined) setInternalDate(value);
    setStatusError("");
    onDateChange?.(value);
  }

  async function updateStatus(id: string, status: AppointmentStatusValue) {
    setUpdatingId(id);
    setStatusError("");
    try {
      const response = await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Төлөв шинэчлэх үед алдаа гарлаа.");
      setResult((previous) => ({ ...previous, appointments: previous.appointments.map((appointment) => appointment.id === id ? { ...appointment, status } : appointment) }));
      onStatusChange?.(id, status);
      setRevision((value) => value + 1);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Төлөв шинэчлэх үед алдаа гарлаа.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Захиалгын жагсаалт</h2>
          <p className="text-sm text-slate-500" aria-live="polite">{formatAppointmentDate(date)} · {currentResult ? `Нийт ${appointments.length} захиалга` : "Уншиж байна..."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => changeDate(shiftDate(date, -1))} aria-label="Өмнөх өдөр" title="Өмнөх өдөр"><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={date} onChange={(event) => changeDate(event.target.value)} aria-label="Огноогоор шүүх" className="w-40" />
          <Button type="button" variant="outline" size="icon" onClick={() => changeDate(shiftDate(date, 1))} aria-label="Дараагийн өдөр" title="Дараагийн өдөр"><ChevronRight className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { changeDate(todayValue()); setRevision((value) => value + 1); }}>Өнөөдөр</Button>
        </div>
      </div>
      {currentResult?.error ? <div role="alert" className="flex items-center gap-2 bg-red-50 px-4 py-3 text-sm text-red-700"><p>{currentResult.error}</p><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Жагсаалт дахин авах</Button></div> : null}
      {statusError ? <p role="alert" className="bg-red-50 px-4 py-3 text-sm text-red-700">{statusError}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm" aria-busy={!currentResult}>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Огноо</th><th className="px-4 py-3">Цаг</th><th className="px-4 py-3">Өвчтөн</th><th className="px-4 py-3">Эмч</th><th className="px-4 py-3">Үйлчилгээ</th><th className="px-4 py-3">Төлөв</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {appointments.map((appointment) => <tr key={appointment.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">{formatAppointmentDate(appointment.appointmentDate)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{appointment.startTime} - {appointment.endTime}</td>
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{appointment.patient.lastName} {appointment.patient.firstName}</p><p className="text-xs text-slate-500">{appointment.patient.phone}</p></td>
              <td className="px-4 py-3 text-slate-700">{appointment.doctor.fullName}</td>
              <td className="px-4 py-3 text-slate-700">{appointment.service.name}</td>
              <td className="px-4 py-3">{editable ? (() => {
                const options = manuallySelectableAppointmentStatusOptions(appointment.status);
                return <select value={appointment.status} disabled={updatingId !== null || options.length === 1} onChange={(event) => void updateStatus(appointment.id, event.target.value as AppointmentStatusValue)} className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${statusStyles[appointment.status]}`} aria-label="Захиалгын төлөв">{options.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>;
              })() : <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[appointment.status]}`}>{statusLabels[appointment.status]}</span>}</td>
            </tr>)}
            {appointments.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">{!currentResult ? "Уншиж байна..." : currentResult.error ? "Захиалгын жагсаалтыг дахин шалгана уу." : "Энэ өдөр захиалга байхгүй."}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
