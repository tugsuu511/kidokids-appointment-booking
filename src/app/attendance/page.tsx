import { requireAuth } from "@/lib/auth";
import { attendanceDefaults } from "@/lib/attendance";
import { AttendanceReport } from "@/components/attendance/attendance-report";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ checkoutError?: string }> }) {
  const user = await requireAuth();
  const params = await searchParams;
  return <AttendanceReport isAdmin={user.role === "ADMIN"} defaults={attendanceDefaults()}
    checkoutError={params.checkoutError === "1"} hasAttendance={Boolean(user.attendanceId)} />;
}
