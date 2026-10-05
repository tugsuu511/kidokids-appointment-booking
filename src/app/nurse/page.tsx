import { requireRole } from "@/lib/auth";

export default async function NursePage() {
  await requireRole("NURSE");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Сувилагчийн хэсэг</h1>
      <p className="mt-2 text-slate-600">Та амжилттай нэвтэрлээ. Одоогоор мэдээлэлд хандах эрх нээгээгүй байна.</p>
    </div>
  );
}
