// Run against an isolated migrated database and a local server using that same
// database. Explicit test-only credentials are required; never falls back to .env.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.STAFF_TEST_DATABASE_URL;
assert.ok(databaseUrl, "STAFF_TEST_DATABASE_URL must point to an isolated test branch");
assert.equal(new URL(databaseUrl).hostname, process.env.STAFF_TEST_DATABASE_HOST, "Confirm the isolated database hostname");
const base = process.env.STAFF_TEST_BASE_URL ?? "http://localhost:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Tests must target a local server");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const prefix = `staff_it_${randomUUID().slice(0, 8)}`;
const password = `Test-${randomUUID()}-9`;
const registryPassword = `Registry-${randomUUID()}-9`;
const hash = await bcrypt.hash(password, 10);
const oldRegistryPassword = await prisma.setting.findUnique({ where: { key: "staff_access_password_hash" } });
const userIds: string[] = [];
const doctorIds: string[] = [];
const typeIds: string[] = [];
let appointmentId: string | undefined;

async function call(path: string, method = "GET", body?: object, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(15_000),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;
  const html = isJson ? "" : await response.text();
  return { response, data, html, status: response.status, cookies: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}

async function login(username: string, value = password) {
  const result = await call("/api/auth/login", "POST", { username, password: value });
  assert.equal(result.status, 200, "fixture account can sign in");
  return result.cookies;
}

try {
  const admin = await prisma.user.create({ data: { username: `${prefix}_admin`, fullName: "Test admin", passwordHash: hash, role: "ADMIN" } });
  userIds.push(admin.id);
  const linkedSelf = await prisma.doctor.create({ data: { fullName: "Test admin doctor link", phone: "99000000", userId: admin.id, isActive: false } });
  doctorIds.push(linkedSelf.id);
  await prisma.setting.upsert({ where: { key: "staff_access_password_hash" }, update: { value: await bcrypt.hash(registryPassword, 10) }, create: { key: "staff_access_password_hash", value: await bcrypt.hash(registryPassword, 10) } });

  for (const path of ["/api/staff", "/api/staff-types", "/api/doctors"]) {
    for (const method of ["POST", "PATCH", "DELETE"].filter((method) => path !== "/api/staff-types" || method !== "PATCH")) {
      assert.equal((await call(path, method, {})).status, 403, `${path} ${method} requires admin access`);
    }
  }
  assert.equal((await call("/api/staff")).status, 403);
  const adminSession = await login(admin.username);
  assert.equal((await call("/api/staff", "GET", undefined, adminSession)).status, 403);
  const access = await call("/api/auth/staff-access", "POST", { password: registryPassword }, adminSession);
  assert.equal(access.status, 200);
  const adminCookie = `${adminSession}; ${access.cookies}`;
  console.log("ok: authentication and separate registry password enforced");

  const nurseType = await call("/api/staff-types", "POST", { name: `${prefix} nurse`, role: "NURSE" }, adminCookie);
  assert.equal(nurseType.status, 201);
  typeIds.push(nurseType.data.type.id);
  const newNurse = await call("/api/staff", "POST", { fullName: "Test nurse", username: `${prefix}_nurse`, temporaryPassword: password, phone: "", typeId: nurseType.data.type.id }, adminCookie);
  assert.equal(newNurse.status, 201);
  userIds.push(newNurse.data.member.userId);
  assert.equal(newNurse.data.member.role, "NURSE");
  assert.equal(newNurse.data.member.doctorId, null);
  const nurseLogin = await call("/api/auth/login", "POST", { username: `${prefix}_nurse`, password });
  assert.equal(nurseLogin.status, 200);
  assert.equal(nurseLogin.data.redirectTo, "/nurse");
  const nurseCookie = nurseLogin.cookies;
  const nurseSession = await call("/api/auth/session", "GET", undefined, nurseCookie);
  assert.equal(nurseSession.status, 200);
  assert.equal(nurseSession.data.user.role, "NURSE");
  const nursePage = await call("/nurse", "GET", undefined, nurseCookie);
  assert.equal(nursePage.status, 200);
  assert.ok(nursePage.html.includes("Одоогоор мэдээлэлд хандах эрх нээгээгүй байна."));
  for (const path of ["/api/dashboard?date=2026-10-05", "/api/appointments?date=2026-10-05", "/api/appointments?date=2026-10-05&doctorId=anything", "/api/patients", "/api/patients/anything", "/api/doctor/patients", "/api/staff", "/api/events/appointments"]) {
    assert.equal((await call(path, "GET", undefined, nurseCookie)).status, 403, `nurse cannot read ${path}`);
  }
  for (const [path, method] of [
    ["/api/appointments", "POST"], ["/api/appointments", "PATCH"], ["/api/payment-orders", "PATCH"],
    ["/api/doctor/appointments", "POST"], ["/api/doctor/patients", "PATCH"],
    ["/api/staff", "POST"], ["/api/staff", "PATCH"], ["/api/staff", "DELETE"],
    ["/api/staff-types", "POST"], ["/api/staff-types", "DELETE"],
    ["/api/doctors", "POST"], ["/api/doctors", "PATCH"], ["/api/doctors", "DELETE"],
    ["/api/auth/staff-access", "POST"], ["/api/auth/staff-password", "POST"],
  ]) {
    assert.equal((await call(path, method, {}, nurseCookie)).status, 403, `nurse cannot mutate ${path}`);
  }
  for (const path of ["/dashboard", "/appointments", "/patients", "/doctors", "/doctor", "/reports", "/settings", "/departments", "/queue", "/schedule"]) {
    const page = await call(path, "GET", undefined, nurseCookie);
    assert.ok(page.response.headers.get("location") === "/nurse" || /<meta[^>]+id="__next-page-redirect"[^>]+content="\d+;url=\/nurse"/.test(page.html), `nurse redirected away from ${path}`);
  }
  // Built-in nurse selection and custom nurse types must have the same limits.
  assert.equal((await call("/api/staff", "PATCH", { userId: newNurse.data.member.userId, typeId: "NURSE" }, adminCookie)).status, 200);
  assert.equal((await call("/api/auth/session", "GET", undefined, nurseCookie)).status, 401);
  assert.equal((await call("/api/staff", "PATCH", { userId: newNurse.data.member.userId, typeId: "MANAGER" }, adminCookie)).status, 200);
  const formerManagerSession = await login(`${prefix}_nurse`);
  const streamController = new AbortController();
  const openStream = await fetch(`${base}/api/events/appointments`, { headers: { Cookie: formerManagerSession }, signal: streamController.signal });
  assert.equal(openStream.status, 200);
  const reader = openStream.body!.getReader();
  assert.equal((await reader.read()).done, false);
  try {
    assert.equal((await call("/api/staff", "PATCH", { userId: newNurse.data.member.userId, typeId: "NURSE" }, adminCookie)).status, 200);
    assert.equal((await call("/api/appointments?date=2026-10-05", "GET", undefined, formerManagerSession)).status, 401);
    assert.equal((await call("/api/events/appointments", "GET", undefined, formerManagerSession)).status, 401);
    const timeout = setTimeout(() => streamController.abort(), 35_000);
    try { assert.equal((await reader.read()).done, true, "an already open manager stream closes after nurse reassignment"); }
    finally { clearTimeout(timeout); }
  } finally { streamController.abort(); }
  const restrictedLogin = await login(`${prefix}_nurse`);
  assert.equal((await call("/api/dashboard", "GET", undefined, restrictedLogin)).status, 403);
  console.log("ok: nurses can sign in but cannot access pages, data, writes or existing manager streams");

  for (const body of [{ userId: admin.id, isActive: false }, { userId: admin.id, typeId: "MANAGER" }, { userId: admin.id, temporaryPassword: password }, { doctorId: linkedSelf.id, isActive: false }]) {
    assert.equal((await call("/api/staff", "PATCH", body, adminCookie)).status, 403);
  }
  assert.equal((await call("/api/staff", "DELETE", { userId: admin.id }, adminCookie)).status, 403);
  assert.equal((await call("/api/doctors", "PATCH", { id: linkedSelf.id, isActive: false }, adminCookie)).status, 403);
  assert.equal((await call("/api/doctors", "DELETE", { id: linkedSelf.id }, adminCookie)).status, 403);
  assert.equal((await call("/api/staff", "PATCH", { userId: "missing", isActive: false }, adminCookie)).status, 404);
  console.log("ok: own account protected through staff and legacy doctor endpoints");

  const createdType = await call("/api/staff-types", "POST", { name: `${prefix} Senior manager`, role: "MANAGER" }, adminCookie);
  assert.equal(createdType.status, 201);
  const staffType = createdType.data.type;
  typeIds.push(staffType.id);
  assert.equal((await call("/api/staff-types", "POST", { name: `${prefix} SENIOR MANAGER`, role: "ADMIN" }, adminCookie)).status, 409);
  const created = await call("/api/staff", "POST", { fullName: "Test manager", username: `${prefix}_manager`, temporaryPassword: password, phone: "99000001", typeId: staffType.id }, adminCookie);
  assert.equal(created.status, 201);
  const manager = created.data.member;
  userIds.push(manager.userId);
  assert.equal(manager.role, "MANAGER");
  assert.equal(manager.staffTypeId, staffType.id);
  assert.equal((await call("/api/staff-types", "DELETE", { id: staffType.id }, adminCookie)).status, 409);
  assert.equal((await call("/api/staff", "POST", { fullName: "Duplicate", username: manager.username, temporaryPassword: password, phone: "", typeId: "ADMIN" }, adminCookie)).status, 409);
  const registry = await call("/api/staff", "GET", undefined, adminCookie);
  assert.equal(registry.status, 200);
  assert.ok(registry.data.members.some((member: { userId: string }) => member.userId === admin.id));
  assert.ok(registry.data.members.some((member: { userId: string }) => member.userId === manager.userId));
  assert.ok(!JSON.stringify(registry.data).includes("passwordHash"));
  const managerSession = await login(manager.username);
  const managerDetails = await call("/api/auth/session", "GET", undefined, managerSession);
  assert.equal(managerDetails.data.user.staffTypeName, staffType.name);
  assert.equal((await call("/api/staff", "GET", undefined, managerSession)).status, 403);
  assert.equal((await call("/api/staff", "PATCH", { userId: admin.id, isActive: false }, managerSession)).status, 403);
  assert.equal((await call("/api/staff-types", "POST", { name: "Unauthorized type", role: "ADMIN" }, managerSession)).status, 403);
  console.log("ok: custom staff type, new login, duplicates and manager access boundaries");

  assert.equal((await call("/api/staff", "PATCH", { userId: manager.userId, isActive: false }, adminCookie)).status, 200);
  assert.equal((await call("/api/dashboard", "GET", undefined, managerSession)).status, 401);
  assert.equal((await call("/api/auth/login", "POST", { username: manager.username, password })).status, 401);
  const blockedPage = await call("/patients", "GET", undefined, managerSession);
  assert.ok(blockedPage.response.headers.get("location") === "/login" || /<meta[^>]+id="__next-page-redirect"[^>]+content="\d+;url=\/login"/.test(blockedPage.html), "revoked session redirects to login, including streamed redirects");
  assert.equal((await call("/api/staff", "PATCH", { userId: manager.userId, isActive: true }, adminCookie)).status, 200);
  assert.equal((await call("/api/dashboard", "GET", undefined, managerSession)).status, 401, "reopening must not revive old sessions");
  const reopenedSession = await login(manager.username);
  const resetPassword = `Reset-${randomUUID()}-9`;
  assert.equal((await call("/api/staff", "PATCH", { userId: manager.userId, temporaryPassword: resetPassword }, adminCookie)).status, 200);
  assert.equal((await call("/api/dashboard", "GET", undefined, reopenedSession)).status, 401);
  assert.equal((await call("/api/auth/login", "POST", { username: manager.username, password })).status, 401);
  await login(manager.username, resetPassword);
  console.log("ok: disable, reopen and password reset invalidate previous sessions and page access");

  const promoted = await call("/api/staff", "PATCH", { userId: manager.userId, typeId: "ADMIN" }, adminCookie);
  assert.equal(promoted.status, 200);
  assert.equal(promoted.data.member.role, "ADMIN");
  assert.equal(promoted.data.member.staffTypeId, null);
  const otherAdminSession = await login(manager.username, resetPassword);
  const otherAccess = await call("/api/auth/staff-access", "POST", { password: registryPassword }, otherAdminSession);
  const otherAdminCookie = `${otherAdminSession}; ${otherAccess.cookies}`;
  assert.equal((await call("/api/staff", "GET", undefined, otherAdminCookie)).status, 200);
  assert.equal((await call("/api/staff", "PATCH", { userId: manager.userId, typeId: "DOCTOR", phone: "99000001", room: "IT" }, adminCookie)).status, 200);
  assert.equal((await call("/api/staff", "GET", undefined, otherAdminCookie)).status, 403);
  const convertedDoctor = await prisma.doctor.findUniqueOrThrow({ where: { userId: manager.userId } });
  doctorIds.push(convertedDoctor.id);
  assert.equal(convertedDoctor.isActive, true);
  const doctorSession = await login(manager.username, resetPassword);
  assert.equal((await call("/api/dashboard", "GET", undefined, doctorSession)).status, 403);
  assert.equal((await call("/api/staff", "PATCH", { userId: manager.userId, typeId: "MANAGER" }, adminCookie)).status, 200);
  assert.equal((await prisma.doctor.findUniqueOrThrow({ where: { id: convertedDoctor.id } })).isActive, false);
  assert.equal((await call("/api/appointments", "GET", undefined, doctorSession)).status, 401);
  console.log("ok: other admins can be demoted, doctor profiles follow role changes");

  const orphan = await prisma.doctor.create({ data: { fullName: "Test unlinked doctor", phone: "99000002" } });
  doctorIds.push(orphan.id);
  const attached = await call("/api/staff", "PATCH", { doctorId: orphan.id, username: `${prefix}_doctor`, temporaryPassword: password }, adminCookie);
  assert.equal(attached.status, 200);
  userIds.push(attached.data.member.userId);
  assert.equal(attached.data.member.doctorId, orphan.id);
  const orphanSession = await login(`${prefix}_doctor`);
  assert.equal((await call("/api/doctors", "PATCH", { id: orphan.id, temporaryPassword: resetPassword }, adminCookie)).status, 200);
  assert.equal((await call("/api/appointments", "GET", undefined, orphanSession)).status, 401);
  const patient = await prisma.patient.findFirst({ select: { id: true } });
  const service = await prisma.service.findFirst({ select: { id: true } });
  assert.ok(patient && service, "Branch should contain existing appointment fixtures");
  const appointment = await prisma.appointment.create({ data: { patientId: patient.id, serviceId: service.id, doctorId: orphan.id, appointmentDate: new Date("2035-01-01T00:00:00Z"), startTime: "09:00", endTime: "09:30" } });
  appointmentId = appointment.id;
  assert.equal((await call("/api/staff", "DELETE", { userId: attached.data.member.userId }, adminCookie)).status, 409);
  assert.ok(await prisma.appointment.findUnique({ where: { id: appointmentId } }));
  assert.equal((await call("/api/staff", "PATCH", { userId: attached.data.member.userId, isActive: false }, adminCookie)).status, 200);
  assert.equal((await prisma.doctor.findUniqueOrThrow({ where: { id: orphan.id } })).isActive, false);
  console.log("ok: existing doctors receive logins; history is preserved; legacy resets revoke sessions");

  assert.equal((await call("/api/staff-types", "DELETE", { id: staffType.id }, adminCookie)).status, 200);
  await prisma.auditLog.create({ data: { userId: manager.userId, action: "TEST_ACTIVITY", entity: "User", entityId: manager.userId } });
  assert.equal((await call("/api/staff", "DELETE", { userId: manager.userId }, adminCookie)).status, 409);
  const disposable = await call("/api/staff", "POST", { fullName: "Disposable staff", username: `${prefix}_delete`, temporaryPassword: password, phone: "", typeId: "MANAGER" }, adminCookie);
  assert.equal(disposable.status, 201);
  userIds.push(disposable.data.member.userId);
  assert.equal((await call("/api/staff", "DELETE", { userId: disposable.data.member.userId }, adminCookie)).status, 200);
  assert.equal((await call("/api/auth/login", "POST", { username: `${prefix}_delete`, password })).status, 401);
  console.log("ok: unused types and unused accounts can be deleted");
  console.log("Staff API integration checks passed.");
} finally {
  if (appointmentId) await prisma.appointment.deleteMany({ where: { id: appointmentId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: [...userIds, ...doctorIds, ...typeIds] } }] } });
  await prisma.doctorSchedule.deleteMany({ where: { doctorId: { in: doctorIds } } });
  await prisma.doctor.deleteMany({ where: { OR: [{ id: { in: doctorIds } }, { userId: { in: userIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.staffType.deleteMany({ where: { id: { in: typeIds } } });
  if (oldRegistryPassword) await prisma.setting.update({ where: { key: oldRegistryPassword.key }, data: { value: oldRegistryPassword.value } });
  else await prisma.setting.deleteMany({ where: { key: "staff_access_password_hash" } });
  await prisma.$disconnect();
}
