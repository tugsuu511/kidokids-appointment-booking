"use client";

import { Search, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PatientDetailsDialog } from "@/components/patients/patient-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppointmentDate } from "@/lib/appointments";
import type { PatientsPage } from "@/lib/patients";

type PageItem = number | "start-ellipsis" | "end-ellipsis";

function paginationItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "end-ellipsis", totalPages];
  if (page >= totalPages - 3) return [1, "start-ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "start-ellipsis", page - 1, page, page + 1, "end-ellipsis", totalPages];
}

export function PatientsClient({ initialResult }: { initialResult: PatientsPage }) {
  const [result, setResult] = useState(initialResult);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPage(page: number, searchQuery = query) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (searchQuery) params.set("q", searchQuery);
      const response = await fetch(`/api/patients?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Үйлчлүүлэгчийн жагсаалт авахад алдаа гарлаа.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Үйлчлүүлэгчийн жагсаалт авахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    setQuery(nextQuery);
    await loadPage(1, nextQuery);
  }

  const pages = paginationItems(result.page, result.totalPages);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900"><UsersRound className="h-7 w-7 text-cyan-700" />Үйлчлүүлэгчид</h1>
        </div>
        <form onSubmit={search} className="flex w-full gap-2 md:max-w-lg">
          <Input name="query" aria-label="Үйлчлүүлэгч хайх" placeholder="РД, нэр эсвэл утас" autoComplete="off" />
          <Button type="submit" disabled={loading}><Search className="h-4 w-4" />{loading ? "Хайж байна..." : "Хайх"}</Button>
        </form>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Үйлчлүүлэгчийн жагсаалт">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm" aria-busy={loading}>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Нэр</th><th className="px-4 py-3">РД</th><th className="px-4 py-3">Утас</th><th className="px-4 py-3">Үзлэг</th><th className="px-4 py-3">Сүүлийн үзлэг</th><th className="px-4 py-3 text-right">Үйлдэл</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {result.patients.map((patient) => (
                <tr key={patient.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{patient.lastName} {patient.firstName}</td>
                  <td className="px-4 py-3 text-slate-700">{patient.registerNo || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{patient.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{patient.appointmentCount}</td>
                  <td className="px-4 py-3 text-slate-700">{patient.lastAppointmentAt ? formatAppointmentDate(patient.lastAppointmentAt) : "—"}</td>
                  <td className="px-4 py-3 text-right"><PatientDetailsDialog patientId={patient.id} triggerLabel="Нээх" /></td>
                </tr>
              ))}
              {!loading && result.patients.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Үйлчлүүлэгч олдсонгүй.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {result.totalPages > 1 ? (
          <nav className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-4 py-4" aria-label="Үйлчлүүлэгчийн хуудас">
            <Button type="button" variant="outline" size="sm" disabled={loading || result.page === 1} onClick={() => void loadPage(result.page - 1)}>Өмнөх</Button>
            {pages.map((item) => typeof item === "number" ? (
              <Button
                key={item}
                type="button"
                variant={item === result.page ? "default" : "outline"}
                size="sm"
                aria-current={item === result.page ? "page" : undefined}
                aria-label={`${item}-р хуудас`}
                disabled={loading}
                onClick={() => void loadPage(item)}
                className="min-w-9"
              >
                {item}
              </Button>
            ) : <span key={item} className="px-1 text-slate-400" aria-hidden="true">…</span>)}
            <Button type="button" variant="outline" size="sm" disabled={loading || result.page === result.totalPages} onClick={() => void loadPage(result.page + 1)}>Дараах</Button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
