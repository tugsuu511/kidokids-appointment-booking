"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { DailyAppointments } from "@/components/appointments/daily-appointments";
import { appointmentChangedEventName, type AppointmentChangeEvent } from "@/components/appointments/appointment-realtime-listener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusLabels, type Appointment, type AppointmentStatusValue } from "@/lib/appointments";

type Option = { id: string; label: string };
type SlotAppointment = { startTime: string; endTime: string; status: AppointmentStatusValue };
type Availability = { key: string; slots: SlotAppointment[]; error: string };
const slotStatusStyles: Record<string, string> = {
  BOOKED: "border-amber-300 bg-amber-100 text-amber-700",
  CONFIRMED: "border-cyan-300 bg-cyan-100 text-cyan-700",
  ARRIVED: "border-blue-300 bg-blue-100 text-blue-700",
  COMPLETED: "border-emerald-300 bg-emerald-100 text-emerald-700",
  PAID: "border-teal-300 bg-teal-100 text-teal-700",
  CANCELLED: "border-red-300 bg-red-100 text-red-700",
  NO_SHOW: "border-slate-300 bg-slate-100 text-slate-600",
};
const timeSlots = Array.from({ length: 19 }, (_, index) => {
  const totalMinutes = 8 * 60 + 30 + index * 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});

function slotEndTime(startTime: string) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function AppointmentsClient({ initialDate, initialAppointments, doctors, services }: { initialDate: string; initialAppointments: Appointment[]; doctors: Option[]; services: Option[] }) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [startTime, setStartTime] = useState("08:30");
  const availabilityKey = `${doctorId}:${date}:${availabilityVersion}`;
  const currentAvailability = availability?.key === availabilityKey ? availability : null;
  const availabilityError = currentAvailability?.error ?? "";
  const isAvailabilityReady = Boolean(doctorId && date && currentAvailability && !availabilityError);
  const isAvailabilityLoading = Boolean(doctorId && date && !currentAvailability);
  const knownSlotAppointments = appointments.filter((appointment) =>
    appointment.doctor.id === doctorId &&
    appointment.appointmentDate.slice(0, 10) === date
  );
  const slotAppointments = isAvailabilityReady ? currentAvailability!.slots : knownSlotAppointments;

  useEffect(() => {
    if (!isOpen || !doctorId || !date) return;

    const controller = new AbortController();

    void fetch(`/api/appointments?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Цагийн мэдээлэл авахад алдаа гарлаа.");
        if (!controller.signal.aborted) {
          setAvailability({ key: availabilityKey, slots: data.appointments, error: "" });
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setAvailability({ key: availabilityKey, slots: [], error: requestError instanceof Error ? requestError.message : "Цагийн мэдээлэл авахад алдаа гарлаа." });
      });

    return () => controller.abort();
  }, [availabilityKey, date, doctorId, isOpen]);

  useEffect(() => {
    const onAppointmentChanged = (event: Event) => {
      const change = (event as CustomEvent<AppointmentChangeEvent>).detail;
      if (change?.appointmentDate === date && change.doctorId === doctorId) {
        setAvailabilityVersion((version) => version + 1);
      }
    };
    window.addEventListener(appointmentChangedEventName, onAppointmentChanged);
    return () => window.removeEventListener(appointmentChangedEventName, onAppointmentChanged);
  }, [date, doctorId]);

  async function createAppointment(formData: FormData) {
    if (isSubmitting || !isAvailabilityReady || !selectedStartTime || isTimeBooked(selectedStartTime)) return;

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData.entries())) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setAvailabilityVersion((version) => version + 1);
        setError(data.error ?? "Захиалга үүсгэх үед алдаа гарлаа.");
        return;
      }
      setIsOpen(false);
      setAvailabilityVersion((version) => version + 1);
    } catch {
      setError("Захиалга үүсгэх үед алдаа гарлаа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const getTimeAppointment = (time: string) => {
    const slotStart = timeToMinutes(time);
    const slotEnd = timeToMinutes(slotEndTime(time));
    const overlapping = slotAppointments.filter((appointment) => timeToMinutes(appointment.startTime) < slotEnd && timeToMinutes(appointment.endTime) > slotStart);
    // An active booking takes precedence over cancelled bookings at the same time.
    return overlapping.find((appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status)) ?? overlapping[0];
  };
  const isTimeBooked = (time: string) => {
    const appointment = getTimeAppointment(time);
    return Boolean(appointment && !["CANCELLED", "NO_SHOW"].includes(appointment.status));
  };

  const selectedStartTime = isTimeBooked(startTime) ? (timeSlots.find((time) => !isTimeBooked(time)) ?? "") : startTime;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><h1 className="text-3xl font-bold text-slate-900">Цаг захиалга</h1><Button onClick={() => { setAvailabilityVersion((version) => version + 1); setIsOpen((value) => !value); setError(""); }}><Plus className="h-4 w-4" /> Шинэ захиалга</Button></div>
      {isOpen ? <form className="grid gap-4 rounded-xl border border-cyan-100 bg-cyan-50/60 p-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void createAppointment(new FormData(event.currentTarget)); }}>
        <label className="text-sm font-medium text-slate-700">Өвчтөний нэр<Input name="patientName" autoComplete="off" placeholder="Жишээ: Бат Эрдэнэ" required className="mt-2" /></label>
        <label className="text-sm font-medium text-slate-700">Утас<Input name="patientPhone" type="tel" placeholder="99112233" className="mt-2" /></label>
        <label className="text-sm font-medium text-slate-700">Регистрийн дугаар<Input name="patientRegisterNo" placeholder="Жишээ: АА00112233" autoComplete="off" className="mt-2" /></label>
        <label className="text-sm font-medium text-slate-700">Хүйс<select name="patientGender" defaultValue="" className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Сонгох</option><option value="MALE">Эрэгтэй</option><option value="FEMALE">Эмэгтэй</option><option value="OTHER">Бусад</option></select></label>
        <label className="text-sm font-medium text-slate-700">Эмч<select name="doctorId" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">{doctors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Үйлчилгээ<select name="serviceId" required className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">{services.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Огноо<Input name="appointmentDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="mt-2" /></label>
        <fieldset className="md:col-span-2 xl:col-span-4">
          <legend className="text-sm font-medium text-slate-700">Цаг {isAvailabilityLoading ? <span className="ml-2 text-xs font-normal text-slate-500">Шалгаж байна...</span> : null}</legend>
          <input type="hidden" name="startTime" value={selectedStartTime} />
          <input type="hidden" name="endTime" value={selectedStartTime ? slotEndTime(selectedStartTime) : ""} />
          {availabilityError ? <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-600"><p>{availabilityError} Цагийг дахин шалгана уу.</p><Button type="button" variant="outline" size="sm" onClick={() => setAvailabilityVersion((version) => version + 1)}>Дахин шалгах</Button></div> : null}
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10">
            {timeSlots.map((time) => {
              const appointment = getTimeAppointment(time);
              const booked = isTimeBooked(time);
              return (
                <span key={time} tabIndex={booked ? 0 : undefined} aria-label={booked ? `${time} захиалагдсан, сонгох боломжгүй` : undefined} className={`group relative block ${booked ? "cursor-not-allowed" : ""}`}>
                  <button
                    type="button"
                    disabled={booked || !isAvailabilityReady || isSubmitting}
                    onClick={() => setStartTime(time)}
                    className={`h-10 w-full rounded-md border px-2 text-sm font-medium transition-colors ${appointment ? slotStatusStyles[appointment.status] ?? "border-slate-300 bg-slate-100 text-slate-600" : !isAvailabilityReady ? "border-slate-300 bg-slate-100 text-slate-400" : selectedStartTime === time ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-cyan-400 hover:bg-cyan-50"} ${booked ? "pointer-events-none" : !isAvailabilityReady ? "cursor-not-allowed" : appointment && selectedStartTime === time ? "ring-2 ring-cyan-600" : ""}`}
                    aria-label={booked ? `${time} захиалагдсан` : `${time} сонгох`}
                    aria-describedby={booked ? `unavailable-${time}` : undefined}
                    aria-pressed={!booked && selectedStartTime === time}
                    title={appointment ? statusLabels[appointment.status] : undefined}
                  >
                    {time}
                  </button>
                  {booked ? <span id={`unavailable-${time}`} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-48 -translate-x-1/2 rounded bg-white px-2 py-1 text-xs font-medium text-red-600 opacity-0 shadow-sm ring-1 ring-red-200 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Энэ цаг захиалагдсан. Сонгох боломжгүй.</span> : null}
                </span>
              );
            })}
          </div>
        </fieldset>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Шинж тэмдэг, зовиур<Input name="notes" placeholder="Өвчтөний шинж тэмдэг, зовиурыг бичнэ үү" className="mt-2" /></label>
        <div className="flex items-end gap-2 xl:col-span-4"><Button type="submit" disabled={isSubmitting || !isAvailabilityReady || !selectedStartTime || isTimeBooked(selectedStartTime)}>{isSubmitting ? "Хадгалж байна..." : "Хадгалах"}</Button><Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Болих</Button></div>
      </form> : null}
      {error ? <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <DailyAppointments initialDate={initialDate} initialAppointments={initialAppointments} editable onDateChange={setDate} onStatusChange={(id, status) => {
        setAppointments((items) => items.map((item) => item.id === id ? { ...item, status } : item));
        setAvailabilityVersion((version) => version + 1);
      }} />
    </div>
  );
}
