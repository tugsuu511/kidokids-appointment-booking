// Requires an isolated migrated database and a local app using the same database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { attendanceDate } from "../src/lib/attendance";

const databaseUrl = process.env.ATTENDANCE_TEST_DATABASE_URL;
assert.ok(databaseUrl, "ATTENDANCE_TEST_DATABASE_URL must point to an isolated test database");
assert.equal(new URL(databaseUrl).hostname, process.env.ATTENDANCE_TEST_DATABASE_HOST);
const base = process.env.ATTENDANCE_TEST_BASE_URL ?? "http://localhost:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const prefix = `attendance_it_${randomUUID().slice(0, 8)}`;
const password = `Test-${randomUUID()}`;
const passwordHash = await bcrypt.hash(password, 10);
const userIds: string[] = [];

async function call(path: string, method = "GET", cookie = "", body?: object) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(30000),
  });
  const json = response.headers.get("content-type")?.includes("application/json");
  return { response, status: response.status, data: json ? await response.json() : await response.text(),
    cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}
async function login(username: string) {
  const result = await call("/api/auth/login", "POST", "", { username, password });
  assert.equal(result.status, 200);
  return result.cookie;
}
function assertLoginRedirect(result: Awaited<ReturnType<typeof call>>) {
  assert.ok(result.response.headers.get("location") === "/login" ||
    (typeof result.data === "string" && /<meta[^>]+id="__next-page-redirect"[^>]+content="\d+;url=\/login"/.test(result.data)));
}

try {
  const accounts = new Map<UserRole, { id: string; username: string; cookie: string }>();
  assert.equal((await call("/api/attendance")).status, 401);
  assertLoginRedirect(await call("/attendance"));
  for (const role of ["ADMIN", "MANAGER", "DOCTOR", "NURSE"] as const) {
    const user = await prisma.user.create({ data: { username: `${prefix}_${role}`, fullName: `Attendance ${role}`, role, passwordHash } });
    userIds.push(user.id);
    assert.equal((await call("/api/auth/login", "POST", "", { username: user.username, password: "incorrect-password" })).status, 401);
    assert.equal(await prisma.attendance.count({ where: { userId: user.id } }), 0);
    accounts.set(role, { ...user, cookie: await login(user.username) });
  }
  const admin = accounts.get("ADMIN")!;
  const nurse = accounts.get("NURSE")!;
  for (const [role, account] of accounts) {
    const result = await call("/api/attendance", "GET", account.cookie);
    assert.equal(result.status, 200);
    assert.ok(result.response.headers.get("cache-control")?.includes("no-store"));
    if (role !== "ADMIN") {
      assert.deepEqual(result.data.employees.map((row: { id: string }) => row.id), [account.id]);
      assert.ok(result.data.records.every((row: { userId: string }) => row.userId === account.id));
      assert.ok(result.data.summary.every((row: { userId: string }) => row.userId === account.id));
      assert.equal((await call(`/api/attendance?userId=${admin.id}`, "GET", account.cookie)).status, 403);
    }
    assert.equal((await call("/attendance", "GET", account.cookie)).status, 200);
  }
  console.log("ok: login recording, page access, admin reporting and employee data isolation");

  await Promise.all(Array.from({ length: 5 }, () => login(nurse.username)));
  assert.equal(await prisma.attendance.count({ where: { userId: nurse.id } }), 1);
  assert.equal((await call("/api/auth/logout", "GET", nurse.cookie)).status, 405);
  let open = await prisma.attendance.findFirstOrThrow({ where: { userId: nurse.id, checkOut: null } });
  await assert.rejects(prisma.attendance.create({ data: { userId: nurse.id } }), { code: "P2002" });
  assert.equal((await call("/api/auth/logout", "POST", nurse.cookie)).status, 303);
  const finished = await prisma.attendance.findUniqueOrThrow({ where: { id: open.id } });
  assert.ok(finished.checkOut && finished.checkOut >= finished.checkIn);
  assert.equal((await call("/api/auth/logout", "POST", nurse.cookie)).status, 303);
  assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { id: open.id } })).checkOut?.getTime(), finished.checkOut.getTime());
  const freshCookie = await login(nurse.username);
  await call("/api/auth/logout", "POST", nurse.cookie);
  open = await prisma.attendance.findFirstOrThrow({ where: { userId: nurse.id, checkOut: null, missedCheckOut: false } });
  assert.notEqual(open.id, finished.id, "old browser logout cannot close a new shift");
  console.log("ok: concurrent login deduplication, database constraint, idempotent checkout and old-session protection");

  await prisma.attendance.update({ where: { id: open.id }, data: { checkIn: new Date(Date.now() - 25 * 3600000) } });
  const afterStaleCookie = await login(nurse.username);
  assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { id: open.id } })).missedCheckOut, true);
  await call("/api/auth/logout", "POST", freshCookie);
  assert.equal(await prisma.attendance.count({ where: { userId: nurse.id, checkOut: null, missedCheckOut: false } }), 1);
  await call("/api/auth/logout", "POST", afterStaleCookie);
  const longCookie = await login(nurse.username);
  const longRecord = await prisma.attendance.findFirstOrThrow({ where: { userId: nurse.id, checkOut: null, missedCheckOut: false } });
  await prisma.attendance.update({ where: { id: longRecord.id }, data: { checkIn: new Date(Date.now() - 25 * 3600000) } });
  await call("/api/auth/logout", "POST", longCookie);
  const longFinished = await prisma.attendance.findUniqueOrThrow({ where: { id: longRecord.id } });
  assert.equal(longFinished.missedCheckOut, false);
  assert.ok(longFinished.checkOut, "explicit checkout must preserve the actual exit time even after 24 hours");
  console.log("ok: stale logins start a new record; explicit checkout preserves long shifts");

  const fixtures = [
    { checkIn: new Date("2025-09-30T15:59:59Z"), checkOut: new Date("2025-09-30T16:00:00Z") },
    { checkIn: new Date("2025-09-30T16:00:00Z"), checkOut: new Date("2025-09-30T18:00:00Z") },
    { checkIn: new Date("2025-10-01T15:00:00Z"), checkOut: new Date("2025-10-01T17:00:00Z") },
    { checkIn: new Date("2025-10-01T16:00:00Z"), checkOut: new Date("2025-10-01T18:00:00Z") },
  ];
  await prisma.attendance.createMany({ data: fixtures.map((record) => ({ ...record, userId: nurse.id })) });
  const boundary = await call(`/api/attendance?from=2025-10-01&to=2025-10-01&userId=${nurse.id}`, "GET", admin.cookie);
  assert.equal(boundary.data.total, 2);
  assert.equal(boundary.data.summary[0].days, 1);
  assert.equal(boundary.data.summary[0].durationMs, 4 * 3600000);
  assert.ok(boundary.data.records.every((row: { userId: string }) => row.userId === nurse.id));
  await prisma.attendance.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ userId: nurse.id,
    checkIn: new Date(Date.UTC(2025, 9, 2, 0, index)), checkOut: new Date(Date.UTC(2025, 9, 2, 0, index + 1)) })) });
  const page1 = await call(`/api/attendance?from=2025-10-02&to=2025-10-02&userId=${nurse.id}`, "GET", admin.cookie);
  const page2 = await call(`/api/attendance?from=2025-10-02&to=2025-10-02&userId=${nurse.id}&page=2`, "GET", admin.cookie);
  assert.equal(page1.data.records.length, 50);
  assert.equal(page2.data.records.length, 6);
  assert.equal(page2.data.total, 56);
  assert.deepEqual(page2.data.summary, page1.data.summary, "totals include all pages");
  const ids = new Set(page1.data.records.map((row: { id: string }) => row.id));
  assert.ok(page2.data.records.every((row: { id: string }) => !ids.has(row.id)));
  const calendar = await call(`/api/attendance?from=2025-10-01&to=2025-10-31&userId=${nurse.id}&calendarMonth=2025-10`, "GET", admin.cookie);
  assert.equal(calendar.status, 200);
  assert.equal(calendar.data.records.length, 58, "calendar includes every record, not only the first page");
  const clipped = await call(`/api/attendance?from=2025-10-02&to=2025-10-02&calendarMonth=2025-10`, "GET", afterStaleCookie);
  assert.equal(clipped.data.records.length, 56);
  assert.ok(clipped.data.records.every((row: { userId: string }) => row.userId === nurse.id));
  assert.equal((await call(`/api/attendance?calendarMonth=2025-10&userId=${admin.id}`, "GET", afterStaleCookie)).status, 403);
  const outside = await call(`/api/attendance?from=2025-10-01&to=2025-10-31&calendarMonth=2025-11`, "GET", afterStaleCookie);
  assert.equal(outside.data.records.length, 0, "calendar cannot expose data outside the report range");
  assert.equal((await call("/api/attendance?calendarMonth=invalid", "GET", admin.cookie)).status, 400);
  for (const query of ["from=2026-02-30", "from=2026-10-06&to=2026-10-01", "page=-1", "from=2020-01-01&to=2026-01-01"]) {
    assert.equal((await call(`/api/attendance?${query}`, "GET", admin.cookie)).status, 400);
  }
  console.log("ok: Ulaanbaatar midnight boundaries, overnight durations, pagination and input validation");

  const currentCookie = await login(nurse.username);
  await prisma.user.update({ where: { id: nurse.id }, data: { sessionVersion: { increment: 1 } } });
  assert.equal((await call("/api/attendance", "GET", currentCookie)).status, 401);
  const revokedPage = await call("/attendance", "GET", currentCookie);
  assertLoginRedirect(revokedPage);
  const disabledCookie = await login(nurse.username);
  await prisma.user.update({ where: { id: nurse.id }, data: { isActive: false } });
  assert.equal((await call("/api/attendance", "GET", disabledCookie)).status, 401);
  assert.equal((await call("/api/auth/login", "POST", "", { username: nurse.username, password })).status, 401);
  assert.equal(attendanceDate(new Date("2026-09-30T16:00:00Z")), "2026-10-01");
  console.log("ok: revoked and inactive sessions cannot read attendance");
  console.log("Attendance integration checks passed.");
} finally {
  await prisma.attendance.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}
