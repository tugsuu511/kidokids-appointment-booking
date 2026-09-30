"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, CreditCard, FileText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appointmentChangedEventName, type AppointmentChangeEvent } from "@/components/appointments/appointment-realtime-listener";
import { PatientProfileForm } from "@/components/doctors/doctor-patient-tools";
import { PatientDetailsDialog } from "@/components/patients/patient-details-dialog";
import { PatientSearchPanel } from "@/components/patients/patient-search-panel";
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
} from "@/lib/appointments";

function money(value: string | undefined) {
  return new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function DoctorWorkspace({
  initialDate,
  initialAppointments,
  doctorName,
}: {
  initialDate: string;
  initialAppointments: Appointment[];
  doctorName: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState(initialAppointments[0]?.id ?? "");
  const [followUpAppointmentId, setFollowUpAppointmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0];
  const scheduleFollowUp = Boolean(selected && followUpAppointmentId === selected.id);
  const canComplete = selected?.status === "ARRIVED";
  const selectableStatuses = selected ? manuallySelectableAppointmentStatusOptions(selected.status) : [];

  const load = useCallback(async (value = date, preferredId = selectedId) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/appointments?date=${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Цагийн жагсаалт авахад алдаа гарлаа.");
      setAppointments(data.appointments);
      setSelectedId(
        data.appointments.some((appointment: Appointment) => appointment.id === preferredId)
          ? preferredId
          : (data.appointments[0]?.id ?? ""),
      );
    } catch (caught) {
      setAppointments([]);
      setSelectedId("");
      setError(caught instanceof Error ? caught.message : "Цагийн жагсаалт авахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }, [date, selectedId]);

  useEffect(() => {
    const onAppointmentChanged = (event: Event) => {
      const change = (event as CustomEvent<AppointmentChangeEvent>).detail;
      if (change?.appointmentDate === date) void load(date, selectedId);
    };
    window.addEventListener(appointmentChangedEventName, onAppointmentChanged);
    return () => window.removeEventListener(appointmentChangedEventName, onAppointmentChanged);
  }, [date, load, selectedId]);

  async function request(url: string, body: object, method = "POST", successMessage = "Амжилттай хадгаллаа.") {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлдлийг хадгалах үед алдаа гарлаа.");
      await load();
      setSuccess(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Үйлдлийг хадгалах үед алдаа гарлаа.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function changeDate(value: string) {
    if (!dateFromValue(value) || value === date) return;
    setDate(value);
    setSuccess("");
    setFollowUpAppointmentId(null);
    void load(value, "");
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const form = new FormData(event.currentTarget);
    const saved = await request(
      "/api/doctor/appointments",
      {
        action: "complete",
        appointmentId: selected.id,
        note: form.get("note"),
        amount: form.get("amount"),
        description: form.get("description"),
        scheduleFollowUp,
        ...(scheduleFollowUp
          ? {
              appointmentDate: form.get("appointmentDate"),
              startTime: form.get("startTime"),
              endTime: form.get("endTime"),
            }
          : {}),
      },
      "POST",
      scheduleFollowUp
        ? "Тэмдэглэл, төлбөрийн даалгавар болон давтан үзлэгийн цаг хадгалагдлаа."
        : "Тэмдэглэл болон төлбөрийн даалгавар хадгалагдлаа.",
    );

    if (saved) setFollowUpAppointmentId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Миний үзлэгүүд</h1>
          <p className="mt-1 text-sm text-slate-500">{doctorName} · зөвхөн таны нэр дээрх цагууд</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Өмнөх өдөр" onClick={() => changeDate(shiftDate(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input aria-label="Огноо" type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="w-40" />
          <Button type="button" variant="outline" size="icon" aria-label="Дараагийн өдөр" onClick={() => changeDate(shiftDate(date, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => changeDate(todayValue())}>Өнөөдөр</Button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      <PatientSearchPanel />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <h2 className="font-semibold">Цагийн жагсаалт</h2>
              <p className="text-sm text-slate-500">{formatAppointmentDate(date)} · {appointments.length} цаг</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Шинэчлэх
            </Button>
          </div>
          <div className="divide-y divide-slate-100">
            {appointments.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => {
                  setSelectedId(appointment.id);
                  setSuccess("");
                  setFollowUpAppointmentId(null);
                }}
                className={`w-full p-4 text-left transition hover:bg-slate-50 ${selected?.id === appointment.id ? "bg-cyan-50/70" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{appointment.startTime} – {appointment.endTime} · {appointment.patient.lastName} {appointment.patient.firstName}</p>
                    <p className="mt-1 text-sm text-slate-500">{appointment.service.name} · {appointment.patient.phone}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[appointment.status] ?? "bg-slate-100"}`}>
                    {statusLabels[appointment.status]}
                  </span>
                </div>
              </button>
            ))}
            {!loading && appointments.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Энэ өдөр таны цаг байхгүй.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <div key={selected.id} className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selected.patient.lastName} {selected.patient.firstName}</h2>
                  <p className="text-sm text-slate-500">{selected.startTime} – {selected.endTime} · {selected.service.name}</p>
                </div>
                <PatientDetailsDialog key={selected.patient.id} patientId={selected.patient.id} />
              </div>

              <PatientProfileForm patient={selected.patient} disabled={saving} onSaved={() => load(date, selected.id)} />

              <label className="block text-sm font-medium text-slate-700">
                Үзлэгийн төлөв
                <select
                  value={selected.status}
                  disabled={saving || selectableStatuses.length === 1}
                  onChange={(event) => void request(
                    "/api/appointments",
                    { id: selected.id, status: event.target.value as AppointmentStatusValue },
                    "PATCH",
                    "Үзлэгийн төлөв шинэчлэгдлээ.",
                  )}
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {selectableStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
                </select>
              </label>

              {!canComplete ? <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {selected.status === "COMPLETED" || selected.status === "PAID"
                  ? "Энэ үзлэг дууссан тул төлөвийн урсгалыг буцаах боломжгүй."
                  : "Үзлэгийн мэдээллийг хадгалж дуусгахын өмнө төлөвийг “Ирсэн” болгоно."}
              </p> : null}

              <form onSubmit={saveAppointment} className="space-y-5 border-t border-slate-100 pt-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText className="h-4 w-4 text-cyan-700" />
                    Үзлэгийн тэмдэглэл
                  </div>
                  <textarea
                    name="note"
                    defaultValue={selected.visitRecord?.note ?? ""}
                    required
                    maxLength={4000}
                    rows={5}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Онош, үзлэгийн дүгнэлт, зөвлөмж..."
                  />
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <label className="flex cursor-pointer items-center gap-3 font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={scheduleFollowUp}
                      onChange={(event) => setFollowUpAppointmentId(event.target.checked ? selected.id : null)}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                    />
                    Давтан үзлэг товлох
                  </label>
                  {scheduleFollowUp ? (
                    <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                      <Input
                        name="appointmentDate"
                        aria-label="Давтан үзлэгийн огноо"
                        type="date"
                        min={todayValue()}
                        defaultValue={date < todayValue() ? todayValue() : date}
                        required
                      />
                      <div className="flex gap-2">
                        <Input name="startTime" aria-label="Эхлэх цаг" type="time" defaultValue="09:00" required />
                        <Input name="endTime" aria-label="Дуусах цаг" type="time" defaultValue="09:30" required />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 border-t border-slate-100 pt-5">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <CreditCard className="h-4 w-4 text-cyan-700" />
                    Төлбөрийн даалгавар
                  </div>
                  <Input
                    name="amount"
                    aria-label="Төлбөрийн дүн"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={selected.paymentOrder?.amount ?? selected.service.price ?? ""}
                    required
                  />
                  <Input
                    name="description"
                    aria-label="Төлбөрийн тайлбар"
                    defaultValue={selected.paymentOrder?.description ?? ""}
                    placeholder="Тайлбар (сонголтоор)"
                  />
                  <p className="text-xs text-slate-500">
                    Дүн: {money(selected.paymentOrder?.amount ?? selected.service.price)} ₮ · {selected.paymentOrder ? "үүссэн даалгаврыг шинэчилнэ" : "шинэ даалгавар үүсгэнэ"}
                  </p>
                </div>

                <Button type="submit" disabled={saving || !canComplete} className="w-full">
                  {saving ? "Хадгалж байна..." : canComplete ? "Үзлэгийг дуусгаж, төлбөр үүсгэх" : "Үзлэг дуусгах боломжгүй"}
                </Button>
              </form>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">Үзэх цаг сонгоно уу.</p>
          )}
        </section>
      </div>
    </div>
  );
}
