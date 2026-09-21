import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import type { Role, SessionUser } from "@/types/auth";

const secret = process.env.JWT_SECRET ?? "development-secret-change-me";
const encodedSecret = new TextEncoder().encode(secret);

export async function createSessionToken(user: SessionUser) {
  return await new SignJWT({
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedSecret);
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, encodedSecret);
  return payload as {
    sub: string;
    username: string;
    fullName: string;
    role: Role;
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export const getCurrentUserCached = cache(getCurrentUser);

export async function requireAuth() {
  const user = await getCurrentUserCached();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(...allowedRoles: Role[]) {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}
