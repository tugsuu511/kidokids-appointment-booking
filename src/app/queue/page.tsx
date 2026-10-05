import { requireRole } from "@/lib/auth";

export default async function QueuePage() {
  await requireRole("ADMIN", "MANAGER", "DOCTOR");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Үзлэгийн дараалал</h1>
      <p className="mt-2 text-slate-600">Өнөөдрийн үзлэгийн дараалал, ирсэн төлөв.</p>
    </div>
  );
}
