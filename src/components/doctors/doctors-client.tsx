"use client";

import { useState, type FormEvent } from "react";
import { Copy, KeyRound, Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Doctor = {
  id: string;
  fullName: string;
  phone: string;
  room: string | null;
  userId: string | null;
  user: { id: string; fullName: string; username: string } | null;
  isActive: boolean;
};

type DoctorForm = Pick<Doctor, "fullName" | "phone" | "room"> & { username: string; temporaryPassword: string };

const emptyForm: DoctorForm = { fullName: "", phone: "", room: "", username: "", temporaryPassword: "" };

function sorted(doctors: Doctor[]) {
  return [...doctors].sort((left, right) => left.fullName.localeCompare(right.fullName, "mn"));
}

export function DoctorsClient({ initialDoctors }: { initialDoctors: Doctor[] }) {
  const [doctors, setDoctors] = useState(() => sorted(initialDoctors));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [form, setForm] = useState<DoctorForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);

  function openNewDoctor() {
    setIsFormOpen(true);
    setEditingDoctor(null);
    setForm(emptyForm);
    setError("");
    setCreatedCredentials(null);
  }

  function openEditDoctor(doctor: Doctor) {
    setIsFormOpen(true);
    setEditingDoctor(doctor);
    setForm({ fullName: doctor.fullName, phone: doctor.phone, room: doctor.room ?? "", username: doctor.user?.username ?? "", temporaryPassword: "" });
    setError("");
    setCreatedCredentials(null);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingDoctor(null);
    setForm(emptyForm);
    setError("");
  }

  async function request(url: string, method: "POST" | "PATCH" | "DELETE", body: object) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Үйлдэл хийх үед алдаа гарлаа.");
    return data;
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const base = { fullName: form.fullName, phone: form.phone, room: form.room };
      const payload = editingDoctor
        ? { id: editingDoctor.id, ...base, ...(form.username ? { username: form.username } : {}), ...(form.temporaryPassword ? { temporaryPassword: form.temporaryPassword } : {}) }
        : { ...base, username: form.username, temporaryPassword: form.temporaryPassword };
      const data = await request("/api/doctors", editingDoctor ? "PATCH" : "POST", payload);
      setDoctors((current) => sorted(editingDoctor ? current.map((doctor) => doctor.id === data.doctor.id ? data.doctor : doctor) : [...current, data.doctor]));
      if (!editingDoctor || form.temporaryPassword) setCreatedCredentials({ username: form.username, password: form.temporaryPassword });
      closeForm();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Эмчийн мэдээлэл хадгалах үед алдаа гарлаа.");
    } finally {
      setIsSaving(false);
    }
  }

  function generateTemporaryPassword() {
    setForm((current) => ({ ...current, temporaryPassword: `Kk-${crypto.randomUUID().slice(0, 8)}-9!` }));
  }

  async function toggleDoctor(doctor: Doctor) {
    setIsSaving(true);
    setError("");
    try {
      const data = await request("/api/doctors", "PATCH", { id: doctor.id, isActive: !doctor.isActive });
      setDoctors((current) => current.map((item) => item.id === doctor.id ? data.doctor : item));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Төлөв өөрчлөх үед алдаа гарлаа.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDoctor(doctor: Doctor) {
    if (!window.confirm(`${doctor.fullName} эмчийг устгах уу?`)) return;
    setIsSaving(true);
    setError("");
    try {
      await request("/api/doctors", "DELETE", { id: doctor.id });
      setDoctors((current) => current.filter((item) => item.id !== doctor.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Эмч устгах үед алдаа гарлаа.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Бүртгэлтэй эмч нар</h2>
        <Button type="button" onClick={openNewDoctor}><Plus className="h-4 w-4" />Шинэ эмч нэмэх</Button>
      </div>

      {isFormOpen ? <form onSubmit={saveDoctor} className="mt-4 grid gap-4 rounded-lg border border-cyan-200 bg-cyan-50/50 p-4 md:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="doctor-full-name">Эмчийн нэр</Label><Input id="doctor-full-name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required /></div>
        <div className="space-y-2"><Label htmlFor="doctor-phone">Утас</Label><Input id="doctor-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required /></div>
        <div className="space-y-2"><Label htmlFor="doctor-room">Өрөө</Label><Input id="doctor-room" value={form.room ?? ""} onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="doctor-username">Нэвтрэх нэр</Label><Input id="doctor-username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required={!editingDoctor || !editingDoctor.userId} autoComplete="off" placeholder="doctor.name" /><p className="text-xs text-slate-500">Латин үсэг, тоо болон . _ - ашиглана.</p></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="doctor-password">{editingDoctor?.userId ? "Шинэ түр нууц үг (солих бол)" : "Түр нууц үг"}</Label><div className="flex gap-2"><Input id="doctor-password" value={form.temporaryPassword} onChange={(event) => setForm((current) => ({ ...current, temporaryPassword: event.target.value }))} required={!editingDoctor || !editingDoctor.userId} minLength={8} autoComplete="new-password" /><Button type="button" variant="outline" onClick={generateTemporaryPassword}><KeyRound className="h-4 w-4" />Үүсгэх</Button></div><p className="text-xs text-slate-500">{editingDoctor && !editingDoctor.userId ? "Энэ эмчид нэвтрэх эрхийг шинээр үүсгэнэ." : "Хамгийн багадаа 8 тэмдэгт, үсэг болон тоо агуулна."}</p></div>
        <div className="flex items-end gap-2 md:col-span-3"><Button type="submit" disabled={isSaving}>{editingDoctor ? "Өөрчлөлт хадгалах" : "Эмч ба нэвтрэх эрх үүсгэх"}</Button><Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}><X className="h-4 w-4" />Болих</Button></div>
      </form> : null}

      {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}

      {createdCredentials ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">Эмчийн нэвтрэх эрх бэлэн боллоо</p><p className="mt-2">Нэвтрэх нэр: <strong>{createdCredentials.username}</strong></p><p>Түр нууц үг: <strong>{createdCredentials.password}</strong></p><div className="mt-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(`Нэвтрэх нэр: ${createdCredentials.username}\nТүр нууц үг: ${createdCredentials.password}`)}><Copy className="h-4 w-4" />Хуулах</Button><Button type="button" variant="ghost" size="sm" onClick={() => setCreatedCredentials(null)}>Хаах</Button></div><p className="mt-2 text-xs text-emerald-800">Энэ мэдээллийг эмчид аюулгүй сувгаар дамжуулна уу. Нууц үг дахин харагдахгүй.</p></div> : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Эмч</th><th className="px-4 py-3">Нэвтрэх нэр</th><th className="px-4 py-3">Утас</th><th className="px-4 py-3">Өрөө</th><th className="px-4 py-3">Төлөв</th><th className="px-4 py-3 text-right">Үйлдэл</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {doctors.map((doctor) => <tr key={doctor.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{doctor.fullName}</td><td className="px-4 py-3 text-slate-700">{doctor.user?.username ?? "Холбоогүй"}</td><td className="px-4 py-3 text-slate-700">{doctor.phone}</td><td className="px-4 py-3 text-slate-700">{doctor.room ?? "-"}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${doctor.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{doctor.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => openEditDoctor(doctor)} disabled={isSaving}><Pencil className="h-4 w-4" />Засах</Button><Button type="button" variant="outline" size="sm" onClick={() => void toggleDoctor(doctor)} disabled={isSaving}>{doctor.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}{doctor.isActive ? "Идэвхгүй" : "Идэвхжүүлэх"}</Button><Button type="button" variant="outline" size="sm" onClick={() => void deleteDoctor(doctor)} disabled={isSaving} className="text-red-700 hover:text-red-800"><Trash2 className="h-4 w-4" />Устгах</Button></div></td>
            </tr>)}
            {doctors.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Бүртгэлтэй эмч байхгүй байна.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
