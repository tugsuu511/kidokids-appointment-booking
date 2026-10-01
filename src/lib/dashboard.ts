import type { AppointmentStatusValue } from "@/lib/appointments";

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

export type DashboardSummaryData = {
  date: string;
  todayCount: number;
  byStatus: Partial<Record<AppointmentStatusValue, number>>;
  pendingCount: number;
  pendingAmount: string;
  orders: PaymentOrderItem[];
};
