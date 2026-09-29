import "server-only";

import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/types/auth";

export async function getDoctorForUser(user: SessionUser) {
  if (user.role !== "DOCTOR") return null;

  return prisma.doctor.findFirst({
    where: { userId: user.id, isActive: true },
    select: { id: true, fullName: true },
  });
}
