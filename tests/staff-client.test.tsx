import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import { StaffClient } from "../src/components/staff/staff-client";
import type { StaffMember } from "../src/types/staff";

let testing: typeof import("@testing-library/react");
const originalFetch = globalThis.fetch;
const members: StaffMember[] = [
  { id: "admin", userId: "admin", doctorId: null, fullName: "Миний админ", username: "admin", phone: "", room: null, role: "ADMIN", staffTypeId: null, isActive: true },
  { id: "other", userId: "other", doctorId: null, fullName: "Бусад админ", username: "other", phone: "", room: null, role: "ADMIN", staffTypeId: null, isActive: true },
  { id: "manager", userId: "manager", doctorId: null, fullName: "Менежер Болор", username: "manager", phone: "99112233", room: null, role: "MANAGER", staffTypeId: null, isActive: false },
  { id: "doctor", userId: null, doctorId: "doctor", fullName: "Эмч Наран", username: null, phone: "99001122", room: "101", role: "DOCTOR", staffTypeId: null, isActive: true },
];

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3100/doctors" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  dom.window.confirm = () => true;
  testing = await import("@testing-library/react");
});

afterEach(() => { testing.cleanup(); globalThis.fetch = originalFetch; });

function mount() {
  return testing.render(<StaffClient initialMembers={members} initialTypes={[]} currentUserId="admin" />);
}

test("all staff roles are listed, other admins are editable, own account is protected", () => {
  const view = mount();
  assert.ok(view.getByText("Менежер Болор"));
  assert.ok(view.getByText("Эмч Наран"));
  assert.ok(view.getByRole("button", { name: "Бусад админ засах" }));
  assert.equal(view.queryByRole("button", { name: "Миний админ засах" }), null);
  assert.equal(view.queryByRole("button", { name: "Миний админ эрх хаах" }), null);
  assert.equal(view.queryByRole("button", { name: "Миний админ устгах" }), null);
});

test("opening access for an existing doctor asks for both login credentials", () => {
  const view = mount();
  testing.fireEvent.click(view.getByRole("button", { name: "Эмч Наран эрх нээх" }));
  assert.equal((view.getByLabelText("Нэвтрэх нэр") as HTMLInputElement).required, true);
  assert.equal((view.getByLabelText("Нууц үг") as HTMLInputElement).required, true);
  assert.equal((view.getByLabelText("Ажилтны төрөл") as HTMLSelectElement).value, "DOCTOR");
});

test("custom staff type can be created and assigned in the staff form", async () => {
  const requests: object[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/staff-types");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ type: { id: "senior", name: "Ахлах менежер", role: "MANAGER" } });
  };
  const view = mount();
  testing.fireEvent.click(view.getByRole("button", { name: "Шинэ ажилтны төрөл" }));
  testing.fireEvent.change(view.getByLabelText("Төрлийн нэр"), { target: { value: "Ахлах менежер" } });
  await testing.act(async () => testing.fireEvent.click(view.getByRole("button", { name: "Төрөл үүсгэх" })));
  assert.deepEqual(requests, [{ name: "Ахлах менежер", role: "MANAGER" }]);
  testing.fireEvent.click(view.getByRole("button", { name: "Шинэ ажилтан нэмэх" }));
  testing.fireEvent.change(view.getByLabelText("Ажилтны төрөл"), { target: { value: "senior" } });
  assert.equal((view.getByLabelText("Ажилтны төрөл") as HTMLSelectElement).value, "senior");
});

test("reopening a manager account updates its row from the server response", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/staff");
    assert.equal(init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init?.body)), { userId: "manager", isActive: true });
    return Response.json({ member: { ...members[2], isActive: true } });
  };
  const view = mount();
  await testing.act(async () => testing.fireEvent.click(view.getByRole("button", { name: "Менежер Болор эрх нээх" })));
  assert.ok(view.getByRole("button", { name: "Менежер Болор эрх хаах" }));
});

test("rejected access change leaves the original account state intact", async () => {
  globalThis.fetch = async () => Response.json({ error: "Эрх дууссан байна." }, { status: 403 });
  const view = mount();
  await testing.act(async () => testing.fireEvent.click(view.getByRole("button", { name: "Менежер Болор эрх нээх" })));
  assert.equal(view.getByRole("alert").textContent, "Эрх дууссан байна.");
  assert.ok(view.getByRole("button", { name: "Менежер Болор эрх нээх" }));
});

test("saving another admin's role sends the target account and preserves an unchanged password", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(init?.method, "PATCH");
    assert.equal(body.userId, "other");
    assert.equal(body.typeId, "MANAGER");
    assert.equal("temporaryPassword" in body, false);
    return Response.json({ member: { ...members[1], role: "MANAGER" } });
  };
  const view = mount();
  testing.fireEvent.click(view.getByRole("button", { name: "Бусад админ засах" }));
  testing.fireEvent.change(view.getByLabelText("Ажилтны төрөл"), { target: { value: "MANAGER" } });
  await testing.act(async () => testing.fireEvent.click(view.getByRole("button", { name: "Өөрчлөлт хадгалах" })));
  assert.equal(view.queryByLabelText("Шинэ нууц үг (солих бол)"), null);
  assert.ok(view.getByRole("status"));
});

test("creating login for an inactive unlinked doctor opens access and replaces the old row", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.doctorId, "doctor");
    assert.equal(body.isActive, true);
    assert.equal(body.username, "new.doctor");
    assert.equal(body.temporaryPassword, "Testpass123!");
    return Response.json({ member: { ...members[3], id: "new-account", userId: "new-account", username: body.username, isActive: true } });
  };
  const view = testing.render(<StaffClient initialMembers={[{ ...members[3], isActive: false }]} initialTypes={[]} currentUserId="admin" />);
  testing.fireEvent.click(view.getByRole("button", { name: "Эмч Наран эрх нээх" }));
  assert.equal((view.getByLabelText("Нэвтрэх эрх") as HTMLSelectElement).value, "true");
  testing.fireEvent.change(view.getByLabelText("Нэвтрэх нэр"), { target: { value: "new.doctor" } });
  testing.fireEvent.change(view.getByLabelText("Нууц үг"), { target: { value: "Testpass123!" } });
  await testing.act(async () => testing.fireEvent.click(view.getByRole("button", { name: "Өөрчлөлт хадгалах" })));
  assert.equal(view.getAllByText("Эмч Наран").length, 1);
  assert.ok(view.getByRole("button", { name: "Эмч Наран эрх хаах" }));
});

test("nurse staff type creates a login-only role without manager permissions", async () => {
  const view = mount();
  testing.fireEvent.click(view.getByRole("button", { name: "Шинэ ажилтан нэмэх" }));
  testing.fireEvent.change(view.getByLabelText("Ажилтны төрөл"), { target: { value: "NURSE" } });
  assert.ok(view.getAllByText("Зөвхөн нэвтрэх эрхтэй. Мэдээлэл харах, өөрчлөх эрхгүй.").length);
  assert.equal(view.queryByLabelText("Өрөө"), null);
});

test("the migrated nurse type and built-in nurse accounts share one correctly selected option", () => {
  const nurse: StaffMember = { ...members[2], id: "nurse", userId: "nurse", fullName: "Сувилагч Болор", role: "NURSE" };
  const assignedNurse: StaffMember = { ...nurse, id: "assigned", userId: "assigned", fullName: "Сувилагч Наран", staffTypeId: "existing-nurse-type" };
  const view = testing.render(<StaffClient initialMembers={[nurse, assignedNurse]} initialTypes={[{ id: "existing-nurse-type", name: "Сувилагч", role: "NURSE" }]} currentUserId="admin" />);
  testing.fireEvent.click(view.getByRole("button", { name: "Сувилагч Болор засах" }));
  const select = view.getByLabelText("Ажилтны төрөл") as HTMLSelectElement;
  assert.equal(select.value, "existing-nurse-type");
  assert.equal(Array.from(select.options).filter((option) => option.text.startsWith("Сувилагч")).length, 1);
  testing.fireEvent.click(view.getByRole("button", { name: "Болих" }));
  testing.fireEvent.change(view.getByLabelText("Төрлөөр шүүх"), { target: { value: "existing-nurse-type" } });
  assert.ok(view.getByText("Сувилагч Болор"));
  assert.ok(view.getByText("Сувилагч Наран"));
});
