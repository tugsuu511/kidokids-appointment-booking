import { requireRole } from "@/lib/auth";

export default async function NursePage() {
  await requireRole("NURSE");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Сувилагчийн хэсэг</h1>
      <p className="mt-2 text-slate-600">Та амжилттай нэвтэрлээ. «Миний цагийн тайлан» цэсээс орсон, гарсан цаг болон нийт хугацаагаа харна уу. Ажил дуусахад «Гарах» товч дарж гарсан цагаа бүртгэнэ үү.</p>
    </div>
  );
}
