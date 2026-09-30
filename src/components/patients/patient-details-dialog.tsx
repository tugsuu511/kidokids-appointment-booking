"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Eye, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { formatAppointmentDate, statusLabels, statusStyles } from "@/lib/appointments";
import { patientGenderLabels, type PatientDetails } from "@/lib/patients";

export function PatientDetailsDialog({
  patientId,
  triggerLabel = "Мэдээлэл харах",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  patientId: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<PatientDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPatient() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлчлүүлэгчийн мэдээлэл авахад алдаа гарлаа.");
      setPatient(data.patient);
    } catch (caught) {
      setPatient(null);
      setError(caught instanceof Error ? caught.message : "Үйлчлүүлэгчийн мэдээлэл авахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void loadPatient();
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize}>
          <Eye className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <Dialog.Title className="text-xl font-bold text-slate-900">Үйлчлүүлэгчийн дэлгэрэнгүй</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Хаах"><X className="h-5 w-5" /></Button>
            </Dialog.Close>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Уншиж байна...</div>
          ) : error ? (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : patient ? (
            <div className="space-y-6 pt-5">
              <section aria-labelledby={`patient-profile-${patient.id}`}>
                <h2 id={`patient-profile-${patient.id}`} className="text-lg font-semibold text-slate-900">{patient.lastName} {patient.firstName}</h2>
                <dl className="mt-3 grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">Регистрийн дугаар</dt><dd className="mt-1 font-medium text-slate-900">{patient.registerNo || "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Хүйс</dt><dd className="mt-1 font-medium text-slate-900">{patient.gender ? patientGenderLabels[patient.gender] : "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Утас</dt><dd className="mt-1 font-medium text-slate-900">{patient.phone || "—"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Хаяг</dt><dd className="mt-1 font-medium text-slate-900">{patient.address || "—"}</dd></div>
                  <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs text-slate-500">Нэмэлт тэмдэглэл</dt><dd className="mt-1 whitespace-pre-wrap text-slate-800">{patient.notes || "—"}</dd></div>
                </dl>
              </section>

              <section aria-labelledby={`patient-history-${patient.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 id={`patient-history-${patient.id}`} className="font-semibold text-slate-900">Үзлэгийн түүх</h2>
                  <span className="text-xs text-slate-500">Сүүлийн {patient.appointments.length} бүртгэл</span>
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Огноо</th><th className="px-4 py-3">Цаг</th><th className="px-4 py-3">Эмч</th><th className="px-4 py-3">Үйлчилгээ</th><th className="px-4 py-3">Төлөв</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {patient.appointments.map((appointment) => (
                        <tr key={appointment.id}>
                          <td className="px-4 py-3 whitespace-nowrap">{formatAppointmentDate(appointment.appointmentDate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{appointment.startTime} – {appointment.endTime}</td>
                          <td className="px-4 py-3">{appointment.doctor.fullName}</td>
                          <td className="px-4 py-3">{appointment.service.name}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[appointment.status]}`}>{statusLabels[appointment.status]}</span></td>
                        </tr>
                      ))}
                      {patient.appointments.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Үзлэгийн түүх байхгүй.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
