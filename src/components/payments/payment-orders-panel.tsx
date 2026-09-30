"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { appointmentChangedEventName } from "@/components/appointments/appointment-realtime-listener";
import { Button } from "@/components/ui/button";
import { formatAppointmentDate, statusLabels, statusStyles, type AppointmentStatusValue } from "@/lib/appointments";

export type PaymentOrderItem = {
  id: string;
  amount: string;
  description: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
  updatedAt: string;
  appointment: {
    appointmentDate: string;
    status: AppointmentStatusValue;
    patient: { firstName: string; lastName: string; phone: string };
    doctor: { fullName: string };
    service: { name: string };
  };
};

function money(value: string) {
  return new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value));
}

export function PaymentOrdersPanel({ initialOrders, initialPendingCount }: { initialOrders: PaymentOrderItem[]; initialPendingCount: number }) {
  const router = useRouter();
  const [paidIds, setPaidIds] = useState<Set<string>>(() => new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const orders = initialOrders.map((order) => paidIds.has(order.id)
    ? { ...order, status: "PAID" as const, appointment: { ...order.appointment, status: "PAID" as const } }
    : order);
  const optimisticPaidCount = initialOrders.filter((order) => order.status === "PENDING" && paidIds.has(order.id)).length;
  const pendingCount = Math.max(0, initialPendingCount - optimisticPaidCount);

  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(appointmentChangedEventName, refresh);
    return () => window.removeEventListener(appointmentChangedEventName, refresh);
  }, [router]);

  async function markPaid(order: PaymentOrderItem) {
    const patientName = `${order.appointment.patient.lastName} ${order.appointment.patient.firstName}`.trim();
    if (!window.confirm(`${patientName}-ийн ${money(order.amount)} ₮ төлбөрийг төлөгдсөн болгох уу?`)) return;

    setUpdatingId(order.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/payment-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status: "PAID" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Төлбөрийн төлөв шинэчлэх үед алдаа гарлаа.");

      setPaidIds((current) => new Set(current).add(order.id));
      setSuccess("Төлбөрийг төлөгдсөн төлөвт шилжүүллээ.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Төлбөрийн төлөв шинэчлэх үед алдаа гарлаа.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="payment-orders-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h2 id="payment-orders-heading" className="font-semibold text-slate-900">Төлбөрийн даалгавар</h2>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
          {pendingCount} хүлээгдэж буй
        </span>
      </div>

      {error ? <p role="alert" className="mx-5 mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="status" className="mx-5 mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      {orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Үйлчлүүлэгч</th>
                <th className="px-5 py-3">Эмч / үйлчилгээ</th>
                <th className="px-5 py-3">Үзлэгийн огноо</th>
                <th className="px-5 py-3 text-right">Төлбөр</th>
                <th className="px-5 py-3">Төлөв / үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} className={order.status === "PENDING" ? "bg-amber-50/30" : undefined}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{order.appointment.patient.lastName} {order.appointment.patient.firstName}</p>
                    <p className="mt-1 text-xs text-slate-500">{order.appointment.patient.phone}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-slate-900">{order.appointment.doctor.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{order.appointment.service.name}</p>
                    {order.description ? <p className="mt-1 text-xs text-slate-500">{order.description}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {formatAppointmentDate(order.appointment.appointmentDate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">{money(order.amount)} ₮</td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className={`mr-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[order.appointment.status]}`}>
                      {statusLabels[order.appointment.status]}
                    </span>
                    {order.status === "PENDING" ? (
                      <Button
                        type="button"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => void markPaid(order)}
                        disabled={updatingId !== null}
                        aria-label={updatingId === order.id ? "Шинэчилж байна..." : "Төлөгдсөн болгох"}
                        title="Төлөгдсөн болгох"
                      >
                        {updatingId === order.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    ) : (
                      null
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-slate-500">Төлбөрийн даалгавар хараахан үүсээгүй байна.</p>
      )}
    </section>
  );
}
