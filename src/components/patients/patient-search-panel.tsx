"use client";

import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PatientDetailsDialog } from "@/components/patients/patient-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientListItem } from "@/lib/patients";

export function PatientSearchPanel() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function searchPatients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (!query) return;

    setLoading(true);
    setSearched(true);
    setError("");
    try {
      const response = await fetch(`/api/patients?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлчлүүлэгч хайх үед алдаа гарлаа.");
      setPatients(data.patients);
    } catch (caught) {
      setPatients([]);
      setError(caught instanceof Error ? caught.message : "Үйлчлүүлэгч хайх үед алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="patient-search-heading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="patient-search-heading" className="flex items-center gap-2 font-semibold text-slate-900"><Search className="h-4 w-4 text-cyan-700" />Үйлчлүүлэгч хайх</h2>
          <p className="mt-1 text-sm text-slate-500">Өөрийн үзсэн үйлчлүүлэгчийг РД, нэр эсвэл утсаар хайна.</p>
        </div>
        <form onSubmit={searchPatients} className="flex w-full gap-2 lg:max-w-md">
          <Input name="query" aria-label="Үйлчлүүлэгчийн мэдээлэл" placeholder="РД / нэр / утас" autoComplete="off" required />
          <Button type="submit" disabled={loading}>{loading ? "Хайж байна..." : "Хайх"}</Button>
        </form>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {searched && !loading && !error ? (
        <div className="mt-4 space-y-2">
          {patients.map((patient) => (
            <div key={patient.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{patient.lastName} {patient.firstName}</p>
                <p className="truncate text-xs text-slate-500">РД: {patient.registerNo || "—"} · {patient.phone}</p>
              </div>
              <PatientDetailsDialog patientId={patient.id} />
            </div>
          ))}
          {patients.length === 0 ? <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Таны үзсэн үйлчлүүлэгчдээс илэрц олдсонгүй.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
