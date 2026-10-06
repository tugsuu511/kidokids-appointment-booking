import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import "server-only";

import { prisma } from "@/lib/prisma";
import { roleValues, type Role, type SessionUser } from "@/types/auth";
import { roleHomePath } from "@/lib/permissions";

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
    sessionVersion: user.sessionVersion ?? 0,
    attendanceId: user.attendanceId,
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
    sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
    attendanceId: typeof payload.attendanceId === "string" ? payload.attendanceId : undefined,
  } satisfies SessionUser;
}

function isRole(value: unknown): value is Role {
  return roleValues.some((role) => role === value);
}

/**
 * Decode the signed identity. Protected pages and APIs must use getCurrentUser
 * so revoked sessions and changed permissions are checked against the database.
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
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
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
      sessionVersion: true,
      staffType: { select: { name: true } },
    },
  });

  if (!user || !user.isActive || user.sessionVersion !== (sessionUser.sessionVersion ?? 0)) return null;

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    sessionVersion: user.sessionVersion,
    staffTypeName: user.staffType?.name ?? null,
    attendanceId: sessionUser.attendanceId,
  };
});

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(...allowedRoles: Role[]) {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    redirect(roleHomePath(user.role));
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
