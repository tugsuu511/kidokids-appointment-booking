import { StaffAccessForm } from "@/components/auth/staff-access-form";
import { StaffPasswordForm } from "@/components/auth/staff-password-form";
import { StaffClient } from "@/components/staff/staff-client";
import { hasStaffAccess, requireRole } from "@/lib/auth";
import { getStaffRegistry } from "@/lib/staff-registry";
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

  const { members, types } = await getStaffRegistry();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Ажилтны бүртгэл</h1>
      <p className="mt-2 text-slate-600">Өөрөөс бусад бүх ажилтны бүртгэл, төрөл, нэвтрэх нэр, нууц үг болон эрхийг удирдана.</p>
      <StaffClient initialMembers={members} initialTypes={types} currentUserId={user.id} />
      <StaffPasswordForm />
    </div>
  );
}
