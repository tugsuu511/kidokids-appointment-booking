"use client";

import { Search, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppointmentDate, statusLabels, type AppointmentStatusValue } from "@/lib/appointments";
import {
  patientGenderLabels,
  patientGenderValues,
  type PatientProfile,
} from "@/lib/patients";

type PatientSearchResult = PatientProfile & {
  appointments: Array<{
    id: string;
    appointmentDate: string;
    startTime: string;
    status: AppointmentStatusValue;
    doctor: { fullName: string };
    service: { name: string };
  }>;
};

function PatientSummary({ patient }: { patient: PatientProfile }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-xs text-slate-500">РД</dt><dd className="font-medium text-slate-900">{patient.registerNo ?? "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">Хүйс</dt><dd className="font-medium text-slate-900">{patient.gender ? patientGenderLabels[patient.gender] : "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">Утас</dt><dd className="font-medium text-slate-900">{patient.phone}</dd></div>
      <div><dt className="text-xs text-slate-500">Хаяг</dt><dd className="font-medium text-slate-900">{patient.address || "—"}</dd></div>
    </dl>
  );
}

export function PatientRegisterSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);

  async function searchPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const registerNo = String(form.get("registerNo") ?? "").trim();
    if (!registerNo) return;

    setLoading(true);
    setError("");
    setPatient(null);
    try {
      const response = await fetch(`/api/doctor/patients?registerNo=${encodeURIComponent(registerNo)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлчлүүлэгч хайх үед алдаа гарлаа.");
      setPatient(data.patient);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Үйлчлүүлэгч хайх үед алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="patient-search-heading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="patient-search-heading" className="flex items-center gap-2 font-semibold text-slate-900">
            <Search className="h-4 w-4 text-cyan-700" />
            Үйлчлүүлэгчийн хайлт
          </h2>
          <p className="mt-1 text-sm text-slate-500">Регистрийн дугаарыг бүтнээр оруулж хайна.</p>
        </div>
        <form onSubmit={searchPatient} className="flex w-full gap-2 lg:max-w-md">
          <Input name="registerNo" aria-label="Хайх регистрийн дугаар" placeholder="Жишээ: АА00112233" autoComplete="off" required />
          <Button type="submit" disabled={loading}>{loading ? "Хайж байна..." : "Хайх"}</Button>
        </form>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {patient ? (
        <div className="mt-4 space-y-4 rounded-lg border border-cyan-100 bg-cyan-50/40 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">{patient.lastName} {patient.firstName}</h3>
            <PatientSummary patient={patient} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Сүүлийн үзлэгүүд</h4>
            {patient.appointments.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4">Огноо</th><th className="py-2 pr-4">Эмч</th><th className="py-2 pr-4">Үйлчилгээ</th><th className="py-2">Төлөв</th></tr></thead>
                  <tbody className="divide-y divide-cyan-100">
                    {patient.appointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatAppointmentDate(appointment.appointmentDate)} {appointment.startTime}</td>
                        <td className="py-2 pr-4">{appointment.doctor.fullName}</td>
                        <td className="py-2 pr-4">{appointment.service.name}</td>
                        <td className="py-2 whitespace-nowrap">{statusLabels[appointment.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Үзлэгийн түүх байхгүй.</p>}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PatientProfileForm({
  patient,
  disabled,
  onSaved,
}: {
  patient: PatientProfile;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/doctor/patients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, ...Object.fromEntries(form.entries()) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлчлүүлэгчийн мэдээлэл хадгалах үед алдаа гарлаа.");
      await onSaved();
      setSuccess("Үйлчлүүлэгчийн мэдээлэл хадгалагдлаа.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Үйлчлүүлэгчийн мэдээлэл хадгалах үед алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={savePatient} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 font-medium text-slate-800">
        <UserRound className="h-4 w-4 text-cyan-700" />
        Үйлчлүүлэгчийн мэдээлэл
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Регистрийн дугаар<Input name="registerNo" defaultValue={patient.registerNo ?? ""} placeholder="АА00112233" autoComplete="off" required className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Утас<Input name="phone" type="tel" defaultValue={patient.phone} required className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Овог<Input name="lastName" defaultValue={patient.lastName} className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700">Нэр<Input name="firstName" defaultValue={patient.firstName} required className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Хүйс<select name="gender" defaultValue={patient.gender ?? ""} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Сонгох</option>{patientGenderValues.map((gender) => <option key={gender} value={gender}>{patientGenderLabels[gender]}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Хаяг<Input name="address" defaultValue={patient.address ?? ""} placeholder="Оршин суугаа хаяг" className="mt-1" /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Нэмэлт тэмдэглэл<textarea name="notes" defaultValue={patient.notes ?? ""} maxLength={2000} rows={3} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
      </div>
      {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
      <Button type="submit" size="sm" disabled={disabled || saving}>{saving ? "Хадгалж байна..." : "Үйлчлүүлэгчийн мэдээлэл хадгалах"}</Button>
    </form>
  );
}
