"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleValues, type Role } from "@/types/auth";
import { roleDescriptions, roleLabels, type StaffMember, type StaffTypeOption } from "@/types/staff";

type StaffForm = { fullName: string; phone: string; room: string; username: string; temporaryPassword: string; typeId: string; isActive: boolean };
const emptyForm: StaffForm = { fullName: "", phone: "", room: "", username: "", temporaryPassword: "", typeId: "MANAGER", isActive: true };
const builtInTypes: StaffTypeOption[] = roleValues.map((role) => ({ id: role, name: roleLabels[role], role }));
const selectClass = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";
const sorted = (members: StaffMember[]) => [...members].sort((a, b) => a.fullName.localeCompare(b.fullName, "mn"));
const target = (member: StaffMember) => member.userId ? { userId: member.userId } : { doctorId: member.doctorId };

async function request(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Үйлдэл хийх үед алдаа гарлаа.");
  return data;
}

export function StaffClient({ initialMembers, initialTypes, currentUserId }: { initialMembers: StaffMember[]; initialTypes: StaffTypeOption[]; currentUserId: string }) {
  const [members, setMembers] = useState(() => sorted(initialMembers));
  const [types, setTypes] = useState(initialTypes);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeRole, setTypeRole] = useState<Role>("MANAGER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const options = [...builtInTypes.filter((type) => !types.some((custom) => custom.name === type.name && custom.role === type.role)), ...types];
  const memberTypeId = (member: StaffMember) => member.staffTypeId ?? options.find((type) => type.name === roleLabels[member.role] && type.role === member.role)?.id ?? member.role;
  const selectedType = options.find((type) => type.id === form.typeId);
  const visibleMembers = members.filter((member) => (!filterType || memberTypeId(member) === filterType) && `${member.fullName} ${member.username ?? ""} ${member.phone}`.toLocaleLowerCase("mn").includes(search.toLocaleLowerCase("mn")));

  function openForm(member: StaffMember | null) {
    if (member?.userId === currentUserId) return;
    setEditing(member);
    setForm(member ? { fullName: member.fullName, phone: member.phone, room: member.room ?? "", username: member.username ?? "", temporaryPassword: "", typeId: memberTypeId(member), isActive: member.isActive } : emptyForm);
    setFormOpen(true);
    setError("");
    setMessage("");
  }

  function replaceMember(member: StaffMember, previousId?: string) {
    setMembers((current) => sorted([...current.filter((item) => item.id !== (previousId ?? member.id)), member]));
  }

  async function saveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const { temporaryPassword, ...fields } = form;
      const payload = { ...fields, ...(temporaryPassword ? { temporaryPassword } : {}), ...(editing ? target(editing) : {}) };
      const data = await request("/api/staff", editing ? "PATCH" : "POST", payload);
      replaceMember(data.member, editing?.id);
      setFormOpen(false); setEditing(null); setForm(emptyForm);
      setMessage(temporaryPassword ? "Ажилтны мэдээлэл болон нэвтрэх нэр, нууц үгийг хадгаллаа." : "Ажилтны мэдээллийг хадгаллаа.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Мэдээлэл хадгалах үед алдаа гарлаа."); }
    finally { setBusy(false); }
  }

  async function toggleAccess(member: StaffMember) {
    if (member.userId === currentUserId) return;
    if (!member.userId) { openForm(member); setForm((current) => ({ ...current, isActive: true })); return; }
    if (member.isActive && !window.confirm(`${member.fullName} ажилтны нэвтрэх эрхийг хаах уу? Өмнөх нэвтрэлтүүд хүчингүй болно.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await request("/api/staff", "PATCH", { ...target(member), isActive: !member.isActive });
      replaceMember(data.member);
      setMessage(member.isActive ? "Нэвтрэх эрхийг хаалаа." : "Нэвтрэх эрхийг нээлээ.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Эрх өөрчлөх үед алдаа гарлаа."); }
    finally { setBusy(false); }
  }

  async function removeStaff(member: StaffMember) {
    if (member.userId === currentUserId || !window.confirm(`${member.fullName} ажилтны бүртгэлийг устгах уу?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/api/staff", "DELETE", target(member));
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage("Ажилтны бүртгэлийг устгалаа.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ажилтан устгах үед алдаа гарлаа."); }
    finally { setBusy(false); }
  }

  async function saveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const data = await request("/api/staff-types", "POST", { name: typeName, role: typeRole });
      setTypes((current) => [...current, data.type]); setTypeName(""); setTypeFormOpen(false);
      setMessage("Шинэ ажилтны төрөл үүсгэлээ. Ажилтан нэмэх эсвэл засахдаа сонгоно уу.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Төрөл үүсгэх үед алдаа гарлаа."); }
    finally { setBusy(false); }
  }

  async function removeType(type: StaffTypeOption) {
    if (!window.confirm(`«${type.name}» ажилтны төрлийг устгах уу?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/api/staff-types", "DELETE", { id: type.id });
      setTypes((current) => current.filter((item) => item.id !== type.id));
      if (filterType === type.id) setFilterType("");
      if (form.typeId === type.id) setForm((current) => ({ ...current, typeId: "MANAGER" }));
      setMessage("Ажилтны төрлийг устгалаа.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Төрөл устгах үед алдаа гарлаа."); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold text-slate-900">Бүх ажилтан <span className="text-slate-500">({members.length})</span></h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setTypeFormOpen((value) => !value)}><Plus className="h-4 w-4" />Шинэ ажилтны төрөл</Button>
        <Button type="button" disabled={busy} onClick={() => openForm(null)}><Plus className="h-4 w-4" />Шинэ ажилтан нэмэх</Button>
      </div>
    </div>

    {typeFormOpen ? <form onSubmit={saveType} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold">Шинэ ажилтны төрөл үүсгэх</h3>
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="staff-type-name">Төрлийн нэр</Label><Input id="staff-type-name" value={typeName} onChange={(event) => setTypeName(event.target.value)} placeholder="Жишээ: Ахлах менежер" minLength={2} maxLength={60} required /></div>
        <div className="space-y-2"><Label htmlFor="staff-type-role">Олгох эрх</Label><select id="staff-type-role" className={selectClass} value={typeRole} onChange={(event) => setTypeRole(event.target.value as Role)}>{builtInTypes.map((type) => <option key={type.id} value={type.role}>{type.name}</option>)}</select><p className="text-xs text-slate-600">{roleDescriptions[typeRole]}</p></div>
        <p className="text-sm text-slate-600 md:col-span-2">Энэ төрлийн ажилтнууд сонгосон эрхээр ажиллана. Эрхийг солих бол шинэ төрөл үүсгээд ажилтанд онооно.</p>
        <div className="flex gap-2 md:col-span-2"><Button type="submit">Төрөл үүсгэх</Button><Button type="button" variant="outline" onClick={() => setTypeFormOpen(false)}>Болих</Button></div>
      </fieldset>
    </form> : null}

    {formOpen ? <form onSubmit={saveStaff} className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-4">
      <h3 className="mb-4 font-semibold">{editing ? "Ажилтны мэдээлэл, эрх засах" : "Ажилтан бүртгэх"}</h3>
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="staff-name">Ажилтны нэр</Label><Input id="staff-name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} minLength={2} maxLength={100} required /></div>
        <div className="space-y-2"><Label htmlFor="staff-type">Ажилтны төрөл</Label><select id="staff-type" className={selectClass} value={form.typeId} onChange={(event) => setForm({ ...form, typeId: event.target.value })}>{options.map((type) => <option key={type.id} value={type.id}>{type.name}{type.id !== type.role ? ` · ${roleLabels[type.role]} эрх` : ""}</option>)}</select><p className="text-xs text-slate-600">{selectedType ? roleDescriptions[selectedType.role] : ""}</p></div>
        <div className="space-y-2"><Label htmlFor="staff-phone">Утас{selectedType?.role === "DOCTOR" ? " *" : ""}</Label><Input id="staff-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required={selectedType?.role === "DOCTOR"} minLength={selectedType?.role === "DOCTOR" ? 3 : undefined} maxLength={30} /></div>
        {selectedType?.role === "DOCTOR" ? <div className="space-y-2"><Label htmlFor="staff-room">Өрөө</Label><Input id="staff-room" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} maxLength={30} /></div> : null}
        <div className="space-y-2"><Label htmlFor="staff-username">Нэвтрэх нэр</Label><Input id="staff-username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" /><p className="text-xs text-slate-500">Латин үсэг, тоо болон . _ - ашиглана.</p></div>
        <div className="space-y-2"><Label htmlFor="staff-password">{editing?.userId ? "Шинэ нууц үг (солих бол)" : "Нууц үг"}</Label><div className="flex gap-2"><Input id="staff-password" type="text" value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} minLength={8} maxLength={72} required={!editing?.userId} autoComplete="new-password" /><Button type="button" variant="outline" aria-label="Нууц үг үүсгэх" onClick={() => setForm({ ...form, temporaryPassword: `Kk-${crypto.randomUUID().slice(0, 12)}-9!` })}><KeyRound className="h-4 w-4" /></Button></div><p className="text-xs text-slate-500">Үсэг, тоо агуулсан 8-аас доошгүй тэмдэгт. Хадгалахын өмнө нууц үгийг тэмдэглэж аваарай.</p></div>
        <div className="space-y-2"><Label htmlFor="staff-active">Нэвтрэх эрх</Label><select id="staff-active" className={selectClass} value={String(form.isActive)} onChange={(event) => setForm({ ...form, isActive: event.target.value === "true" })}><option value="true">Нээлттэй</option><option value="false">Хаалттай</option></select></div>
        <div className="flex gap-2 md:col-span-2 xl:col-span-3"><Button type="submit">{busy ? "Хадгалж байна…" : editing ? "Өөрчлөлт хадгалах" : "Ажилтан ба нэвтрэх эрх үүсгэх"}</Button><Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditing(null); setForm(emptyForm); }}>Болих</Button></div>
      </fieldset>
    </form> : null}

    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="staff-search">Ажилтан хайх</Label><Input id="staff-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Нэр, нэвтрэх нэр, утас" /></div>
      <div className="space-y-2"><Label htmlFor="staff-filter">Төрлөөр шүүх</Label><select id="staff-filter" className={selectClass} value={filterType} onChange={(event) => setFilterType(event.target.value)}><option value="">Бүх төрөл</option>{options.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
    </div>
    <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[950px] text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Ажилтан</th><th className="px-4 py-3">Төрөл / эрх</th><th className="px-4 py-3">Нэвтрэх нэр</th><th className="px-4 py-3">Утас / өрөө</th><th className="px-4 py-3">Нэвтрэх эрх</th><th className="px-4 py-3 text-right">Үйлдэл</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{visibleMembers.map((member) => {
        const isSelf = member.userId === currentUserId;
        const type = options.find((item) => item.id === memberTypeId(member));
        return <tr key={member.id} className="hover:bg-slate-50">
          <td className="px-4 py-3 font-medium text-slate-900">{member.fullName}{isSelf ? <span className="ml-2 text-xs text-cyan-700">Та</span> : null}</td>
          <td className="px-4 py-3">{type?.name ?? roleLabels[member.role]}{member.staffTypeId ? <p className="text-xs text-slate-500">{roleLabels[member.role]} эрх</p> : null}</td>
          <td className="px-4 py-3">{member.username ?? "Үүсгээгүй"}</td>
          <td className="px-4 py-3">{member.phone || "—"}{member.role === "DOCTOR" && member.room ? <p className="text-xs text-slate-500">Өрөө: {member.room}</p> : null}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.userId && member.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{!member.userId ? "Эрх нээгээгүй" : member.isActive ? "Нээлттэй" : "Хаалттай"}</span></td>
          <td className="px-4 py-3">{isSelf ? <p className="text-right text-xs text-slate-500">Өөрийн эрхийг өөрчлөхгүй</p> : <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || formOpen} onClick={() => openForm(member)} aria-label={`${member.fullName} засах`}><Pencil className="h-4 w-4" />Засах</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || formOpen} onClick={() => void toggleAccess(member)} aria-label={`${member.fullName} ${member.userId && member.isActive ? "эрх хаах" : "эрх нээх"}`}>{member.userId && member.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}{member.userId && member.isActive ? "Эрх хаах" : "Эрх нээх"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || formOpen} onClick={() => void removeStaff(member)} aria-label={`${member.fullName} устгах`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
          </div>}</td>
        </tr>;
      })}{visibleMembers.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">Ажилтан олдсонгүй.</td></tr> : null}</tbody>
    </table></div>
    <details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer font-medium text-slate-800">Ажилтны төрлүүд ({options.length})</summary><div className="mt-3 space-y-3">{options.map((type) => <div key={type.id} className="flex items-center justify-between gap-3 text-sm"><div><p className="font-medium">{type.name} · {roleLabels[type.role]} эрх</p><p className="text-xs text-slate-500">{roleDescriptions[type.role]}</p></div>{type.id !== type.role ? <Button type="button" variant="ghost" size="sm" disabled={busy || members.some((member) => member.staffTypeId === type.id)} aria-label={`${type.name} төрөл устгах`} onClick={() => void removeType(type)}><Trash2 className="h-4 w-4" /></Button> : <span className="text-xs text-slate-400">Үндсэн</span>}</div>)}</div><p className="mt-3 text-xs text-slate-500">Ажилтанд оноосон болон үндсэн төрлийг устгах боломжгүй.</p></details>
  </section>;
}
