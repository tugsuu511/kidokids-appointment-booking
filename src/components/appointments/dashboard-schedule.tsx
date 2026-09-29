"use client";

import { useCallback, useState } from "react";

import { formatAppointmentDate, type Appointment, type DoctorDailySchedule } from "@/lib/appointments";

import { DailyAppointments } from "./daily-appointments";

type ScheduleResult = {
  date: string;
  schedules: DoctorDailySchedule[];
  loading: boolean;
};

export function DashboardSchedule({ initialDate, initialAppointments, initialDoctorSchedules }: {
  initialDate: string;
  initialAppointments: Appointment[];
  initialDoctorSchedules: DoctorDailySchedule[];
}) {
  const [date, setDate] = useState(initialDate);
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult>({ date: initialDate, schedules: initialDoctorSchedules, loading: false });
  const schedules = scheduleResult.date === date ? scheduleResult.schedules : [];
  const isLoading = scheduleResult.date !== date || scheduleResult.loading;

  const changeDate = useCallback((value: string) => {
    setDate(value);
    setScheduleResult({ date: value, schedules: [], loading: true });
  }, []);

  const updateSchedules = useCallback((value: string, nextSchedules: DoctorDailySchedule[]) => {
    setScheduleResult({ date: value, schedules: nextSchedules, loading: false });
  }, []);

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="doctor-schedules-heading">
        <div className="mb-4">
          <h2 id="doctor-schedules-heading" className="font-semibold text-slate-900">Эмч нарын захиалгатай цаг</h2>
          <p className="mt-1 text-sm text-slate-500">{formatAppointmentDate(date)}-ны хуваарь</p>
        </div>
        {isLoading ? <p className="text-sm text-slate-500">Хуваарь уншиж байна...</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {schedules.map((doctor) => (
              <article key={doctor.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-slate-900">{doctor.fullName}</h3>
                  <span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">{doctor.appointments.length} цаг</span>
                </div>
                {doctor.appointments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2" aria-label={`${doctor.fullName}-ийн захиалгатай цаг`}>
                    {doctor.appointments.map((appointment) => (
                      <span key={appointment.id} className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">{appointment.startTime}–{appointment.endTime}</span>
                    ))}
                  </div>
                ) : <p className="mt-3 text-sm text-slate-500">Захиалгатай цаг байхгүй.</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      <DailyAppointments
        initialDate={initialDate}
        initialAppointments={initialAppointments}
        selectedDate={date}
        onDateChange={changeDate}
        onDoctorSchedulesChange={updateSchedules}
      />
    </>
  );
}
