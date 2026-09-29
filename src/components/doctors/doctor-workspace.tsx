"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, CreditCard, FileText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateFromValue, formatAppointmentDate, shiftDate, statusLabels, statusStyles, todayValue, type Appointment } from "@/lib/appointments";

const statusOptions = ["BOOKED", "CONFIRMED", "ARRIVED", "COMPLETED", "CANCELLED", "NO_SHOW"];

function money(value: string | undefined) {
  return new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function DoctorWorkspace({ initialDate, initialAppointments, doctorName }: { initialDate: string; initialAppointments: Appointment[]; doctorName: string }) {
  const [date, setDate] = useState(initialDate);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState(initialAppointments[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0];

  async function load(value = date) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/appointments?date=${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Цагийн жагсаалт авахад алдаа гарлаа.");
      setAppointments(data.appointments);
      setSelectedId(data.appointments[0]?.id ?? "");
    } catch (caught) {
      setAppointments([]);
      setSelectedId("");
      setError(caught instanceof Error ? caught.message : "Цагийн жагсаалт авахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  async function request(url: string, body: object, method = "POST") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлдлийг хадгалах үед алдаа гарлаа.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Үйлдлийг хадгалах үед алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  }

  function changeDate(value: string) {
    if (!dateFromValue(value) || value === date) return;
    setDate(value);
    void load(value);
  }

  function saveVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (selected) void request("/api/doctor/appointments", { action: "visit", appointmentId: selected.id, note: form.get("note") });
  }

  function createFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (selected) void request("/api/doctor/appointments", { action: "follow-up", appointmentId: selected.id, appointmentDate: form.get("appointmentDate"), startTime: form.get("startTime"), endTime: form.get("endTime") });
  }

  function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (selected) void request("/api/doctor/appointments", { action: "payment", appointmentId: selected.id, amount: form.get("amount"), description: form.get("description") });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><h1 className="text-2xl font-bold text-slate-900">Миний үзлэгүүд</h1><p className="mt-1 text-sm text-slate-500">{doctorName} · зөвхөн таны нэр дээрх цагууд</p></div>
        <div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" aria-label="Өмнөх өдөр" onClick={() => changeDate(shiftDate(date, -1))}><ChevronLeft className="h-4 w-4" /></Button><Input aria-label="Огноо" type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="w-40" /><Button type="button" variant="outline" size="icon" aria-label="Дараагийн өдөр" onClick={() => changeDate(shiftDate(date, 1))}><ChevronRight className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={() => changeDate(todayValue())}>Өнөөдөр</Button></div>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><h2 className="font-semibold">Цагийн жагсаалт</h2><p className="text-sm text-slate-500">{formatAppointmentDate(date)} · {appointments.length} цаг</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Шинэчлэх</Button></div>
          <div className="divide-y divide-slate-100">{appointments.map((appointment) => <button key={appointment.id} type="button" onClick={() => setSelectedId(appointment.id)} className={`w-full p-4 text-left transition hover:bg-slate-50 ${selected?.id === appointment.id ? "bg-cyan-50/70" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{appointment.startTime} – {appointment.endTime} · {appointment.patient.lastName} {appointment.patient.firstName}</p><p className="mt-1 text-sm text-slate-500">{appointment.service.name} · {appointment.patient.phone}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[appointment.status] ?? "bg-slate-100"}`}>{statusLabels[appointment.status]}</span></div></button>)}{!loading && appointments.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Энэ өдөр таны цаг байхгүй.</p> : null}</div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{selected ? <div key={selected.id} className="space-y-6"><div><h2 className="text-lg font-semibold text-slate-900">{selected.patient.lastName} {selected.patient.firstName}</h2><p className="text-sm text-slate-500">{selected.startTime} – {selected.endTime} · {selected.service.name}</p></div>
          <label className="block text-sm font-medium text-slate-700">Үзлэгийн төлөв<select value={selected.status} disabled={saving} onChange={(event) => void request("/api/appointments", { id: selected.id, status: event.target.value }, "PATCH")} className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">{statusOptions.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
          <form onSubmit={saveVisit} className="space-y-2 border-t border-slate-100 pt-5"><div className="flex items-center gap-2 font-medium text-slate-800"><FileText className="h-4 w-4 text-cyan-700" />Үзлэгийн тэмдэглэл</div><textarea name="note" defaultValue={selected.visitRecord?.note ?? ""} required maxLength={4000} rows={5} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Онош, үзлэгийн дүгнэлт, зөвлөмж..." /><Button type="submit" disabled={saving}>Тэмдэглэл хадгалах</Button></form>
          <form onSubmit={createFollowUp} className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2"><p className="font-medium text-slate-800 sm:col-span-2">Давтан үзлэг товлох</p><Input name="appointmentDate" type="date" min={date} defaultValue={date} required /><div className="flex gap-2"><Input name="startTime" type="time" defaultValue="09:00" required /><Input name="endTime" type="time" defaultValue="09:30" required /></div><Button type="submit" disabled={saving} className="sm:col-span-2">Давтан цаг үүсгэх</Button></form>
          <form onSubmit={createPayment} className="grid gap-3 border-t border-slate-100 pt-5"><div className="flex items-center gap-2 font-medium text-slate-800"><CreditCard className="h-4 w-4 text-cyan-700" />Төлбөрийн даалгавар</div><Input name="amount" type="number" min="1" step="1" defaultValue={selected.paymentOrder?.amount ?? selected.service.price ?? ""} required /><Input name="description" defaultValue={selected.paymentOrder?.description ?? ""} placeholder="Тайлбар (сонголтоор)" /><p className="text-xs text-slate-500">Дүн: {money(selected.paymentOrder?.amount ?? selected.service.price)} ₮ · {selected.paymentOrder ? "үүссэн даалгаврыг шинэчилнэ" : "шинэ даалгавар үүсгэнэ"}</p><Button type="submit" disabled={saving}>Төлбөрийн даалгавар хадгалах</Button></form>
        </div> : <p className="py-12 text-center text-sm text-slate-500">Үзэх цаг сонгоно уу.</p>}</section>
      </div>
    </div>
  );
}
