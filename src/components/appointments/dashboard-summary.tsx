"use client";

import { CalendarDays, CreditCard, Stethoscope, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { appointmentChangedEventName, type AppointmentChangeEvent } from "@/components/appointments/appointment-realtime-listener";
import { PaymentOrdersPanel } from "@/components/payments/payment-orders-panel";
import type { DashboardSummaryData } from "@/lib/dashboard";

export function DashboardSummary({ initialData }: { initialData: DashboardSummaryData }) {
  const [data, setData] = useState(initialData);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const onChange = (event: Event) => {
      const change = (event as CustomEvent<AppointmentChangeEvent>).detail;
      if (change?.action === "created" && change.appointmentDate !== data.date) return;
      refresh();
    };
    window.addEventListener(appointmentChangedEventName, onChange);
    return () => window.removeEventListener(appointmentChangedEventName, onChange);
  }, [data.date, refresh]);

  useEffect(() => {
    if (revision === 0) return;
    const controller = new AbortController();
    // Coalesce a burst of SSE events and the local payment response into one
    // summary request, without re-rendering the whole server page.
    const timer = setTimeout(() => {
      void fetch("/api/dashboard", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Хяналтын самбар шинэчлэхэд алдаа гарлаа.");
          const summary: DashboardSummaryData = await response.json();
          if (!controller.signal.aborted) {
            setData(summary);
            setError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError("Хяналтын самбар шинэчлэхэд алдаа гарлаа.");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);

  const cards = [
    { title: "Өнөөдрийн цаг", value: data.todayCount, icon: CalendarDays },
    { title: "Захиалсан", value: data.byStatus.BOOKED ?? 0, icon: Users },
    { title: "Баталгаажсан", value: data.byStatus.CONFIRMED ?? 0, icon: Stethoscope },
    {
      title: "Хүлээгдэж буй төлбөр",
      value: data.pendingCount,
      detail: `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(data.pendingAmount))} ₮`,
      icon: CreditCard,
    },
  ];

  return (
    <>
      {error ? <div role="alert" className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-700">
        <p>{error}</p>
        <button type="button" className="underline" onClick={refresh}>Дахин авах</button>
      </div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, icon: Icon, ...card }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                {card.detail ? <p className="mt-1 text-sm font-medium text-slate-600">{card.detail}</p> : null}
              </div>
              <div className="rounded-lg bg-cyan-50 p-3 text-cyan-700"><Icon className="h-6 w-6" /></div>
            </div>
          </div>
        ))}
      </div>
      <PaymentOrdersPanel initialOrders={data.orders} initialPendingCount={data.pendingCount} />
    </>
  );
}
