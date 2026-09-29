import { StaffAccessForm } from "@/components/auth/staff-access-form";
import { StaffPasswordForm } from "@/components/auth/staff-password-form";
import { DoctorsClient } from "@/components/doctors/doctors-client";
import { hasStaffAccess, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasStaffAccessPassword } from "@/lib/staff-access";

export default async function DoctorsPage() {
  const user = await requireRole("ADMIN");
  const [isVerified, hasPassword] = await Promise.all([
    hasStaffAccess(user.id),
    hasStaffAccessPassword(),
  ]);

  if (!isVerified) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Ажилтны бүртгэл</h1>
        <p className="mt-2 text-slate-600">{hasPassword ? "Үргэлжлүүлэхийн тулд ажилтны бүртгэлийн тусдаа нууц үгээ оруулна уу." : "Ажилтны бүртгэлийг хамгаалах тусдаа нууц үг үүсгэнэ үү."}</p>
        <StaffAccessForm setup={!hasPassword} />
      </div>
    );
  }

  const doctors = await prisma.doctor.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      room: true,
      isActive: true,
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          username: true,
        },
      },
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Ажилтны бүртгэл</h1>
      <p className="mt-2 text-slate-600">Эмчийн бүртгэл болон тусдаа нэвтрэх эрхийг хамтад нь үүсгэж, засах боломжтой.</p>
      <DoctorsClient initialDoctors={doctors} />
      <StaffPasswordForm />
    </div>
  );
}
