export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Хуудсыг ачаалж байна">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      <span className="sr-only">Ачаалж байна...</span>
    </div>
  );
}
