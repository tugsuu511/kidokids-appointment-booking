import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import "server-only";

import { prisma } from "@/lib/prisma";
import type { Role, SessionUser } from "@/types/auth";

function getEncodedSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured on the production server.");
  }

  return new TextEncoder().encode(secret ?? "development-secret-change-me");
}

export function assertAuthConfiguration() {
  getEncodedSecret();
}

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
    .sign(getEncodedSecret());
}

export async function createStaffAccessToken(userId: string) {
  return await new SignJWT({ scope: "staff-access-v2" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getEncodedSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getEncodedSecret(), {
    algorithms: ["HS256"],
  });

  if (
    typeof payload.sub !== "string" ||
    typeof payload.username !== "string" ||
    typeof payload.fullName !== "string" ||
    !isRole(payload.role)
  ) {
    throw new Error("Invalid session payload.");
  }

  return {
    id: payload.sub,
    username: payload.username,
    fullName: payload.fullName,
    role: payload.role,
  } satisfies SessionUser;
}

function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "MANAGER" || value === "DOCTOR";
}

/**
 * Fast, stateless authentication for page navigation and display-only session
 * data. The signed token already contains the fields needed for these checks,
 * so this must not wait on the remote database.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
});

/**
 * Database-backed authorization for APIs that read or mutate protected data.
 * Database failures intentionally propagate as server errors instead of being
 * misreported as an expired session.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
}

export async function requireAuth() {
  const user = await getSessionUser();

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

export async function hasStaffAccess(userId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("staff-access")?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getEncodedSecret());
    return payload.sub === userId && payload.scope === "staff-access-v2";
  } catch {
    return false;
  }
}
