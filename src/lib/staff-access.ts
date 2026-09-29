import { prisma } from "@/lib/prisma";

export const staffAccessPasswordKey = "staff_access_password_hash";

export async function hasStaffAccessPassword() {
  return Boolean(await prisma.setting.findUnique({
    where: { key: staffAccessPasswordKey },
    select: { id: true },
  }));
}
