import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import { AttendanceReport } from "../src/components/attendance/attendance-report";

let testing: typeof import("@testing-library/react");
const originalFetch = globalThis.fetch;
before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3101/attendance" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  testing = await import("@testing-library/react");
});
afterEach(() => { testing.cleanup(); globalThis.fetch = originalFetch; });

function report() {
  return {
    employees: [{ id: "nurse", fullName: "Test Nurse", role: "NURSE", isActive: true }],
    summary: [{ userId: "nurse", sessions: 56, days: 4, completed: 55, incomplete: 1, durationMs: 30 * 3600000 }],
    total: 56, page: 1, pageSize: 50,
    records: [{ id: "first", userId: "nurse", checkIn: "2026-09-30T16:00:00Z", checkOut: "2026-09-30T18:00:00Z", missedCheckOut: false }],
  };
}
function mount(isAdmin = false, checkoutError = false, hasAttendance = true) {
  const requests: { url: string; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = (url) => new Promise<Response>((resolve) => requests.push({ url: String(url), resolve }));
  const view = testing.render(<AttendanceReport isAdmin={isAdmin} defaults={{ from: "2026-10-01", to: "2026-10-06" }} checkoutError={checkoutError} hasAttendance={hasAttendance} />);
  return { view, requests };
}

test("employee report shows a Monday-first calendar with local dates and expandable daily details", async () => {
  const { view, requests } = mount();
  assert.ok(view.getByRole("status"));
  await testing.act(async () => requests[0].resolve(Response.json(report())));
  assert.equal(view.queryByRole("combobox", { name: "Ажилтан" }), null);
  assert.ok(view.getByRole("heading", { name: "Миний цагийн тайлан" }));
  assert.equal(view.getAllByText("30 цаг 0 мин").length, 2);
  assert.ok(view.getByText(/00:00/));
  assert.ok(view.getByText(/02:00/));
  assert.equal(new URL(requests[0].url, "http://localhost").searchParams.get("calendarMonth"), "2026-10");
  const calendar = testing.within(view.getByRole("table", { name: "2026 оны 10 сар цаг бүртгэлийн календарь" }));
  assert.deepEqual(calendar.getAllByRole("columnheader").map((cell) => cell.textContent), ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"]);
  const firstWeek = testing.within(calendar.getAllByRole("row")[1]).getAllByRole("cell");
  assert.ok(testing.within(firstWeek[3]).getByRole("button", { name: "2026-10-01, 1 бүртгэл" }));
  assert.equal((view.getByRole("button", { name: "2026-10-07, 0 бүртгэл" }) as HTMLButtonElement).disabled, true);
  testing.fireEvent.click(view.getByRole("button", { name: "2026-10-01, 1 бүртгэл" }));
  assert.ok(view.getByRole("heading", { name: "2026-10-01 · Өдрийн дэлгэрэнгүй" }));
  assert.ok(view.getByText("Орсон цаг", { selector: "dt" }));
  assert.ok(view.getByText("Гарсан цаг", { selector: "dt" }));
  assert.ok(view.getByText("2 цаг 0 мин", { selector: "dd" }));
  assert.equal(view.queryByRole("button", { name: "Дараах" }), null);
});

test("admin selects an employee and a past month, uses the whole month, and hides obsolete results on error", async () => {
  const { view, requests } = mount(true);
  await testing.act(async () => requests[0].resolve(Response.json(report())));
  testing.fireEvent.change(view.getByRole("combobox", { name: "Ажилтан" }), { target: { value: "nurse" } });
  assert.equal(new URL(requests[0].url, "http://localhost").searchParams.get("to"), "2026-10-31");
  testing.fireEvent.change(view.getByLabelText("Тайлангийн сар"), { target: { value: "2026-02" } });
  testing.fireEvent.click(view.getByRole("button", { name: "Тайлан харах" }));
  const params = new URL(requests[1].url, "http://localhost").searchParams;
  assert.equal(params.get("userId"), "nurse");
  assert.equal(params.get("from"), "2026-02-01");
  assert.equal(params.get("to"), "2026-02-28");
  assert.equal(params.get("calendarMonth"), "2026-02");
  assert.equal(view.queryByText("30 цаг 0 мин"), null);
  await testing.act(async () => requests[1].resolve(Response.json({ error: "Серверийн алдаа" }, { status: 500 })));
  assert.ok(view.getByRole("alert"));
  assert.equal(view.queryByText("30 цаг 0 мин"), null);
  testing.fireEvent.click(view.getByRole("button", { name: "Шинэчлэх" }));
  await testing.act(async () => requests[2].resolve(Response.json({ ...report(), summary: [], total: 0, records: [] })));
  assert.equal(view.queryByRole("alert"), null);
  assert.ok(view.getByText("Сонгосон сард цагийн бүртгэл алга."));
  assert.ok(view.getByRole("heading", { name: "Test Nurse · 2026 оны 2 сар" }));
});

test("monthly navigation preserves the employee and crosses year boundaries", async () => {
  const { view, requests } = mount(true);
  await testing.act(async () => requests[0].resolve(Response.json(report())));
  testing.fireEvent.change(view.getByRole("combobox", { name: "Ажилтан" }), { target: { value: "nurse" } });
  testing.fireEvent.change(view.getByLabelText("Тайлангийн сар"), { target: { value: "2026-01" } });
  testing.fireEvent.click(view.getByRole("button", { name: "Тайлан харах" }));
  await testing.act(async () => requests[1].resolve(Response.json(report())));
  testing.fireEvent.click(view.getByRole("button", { name: "Өмнөх сар" }));
  let params = new URL(requests[2].url, "http://localhost").searchParams;
  assert.equal(params.get("from"), "2025-12-01");
  assert.equal(params.get("to"), "2025-12-31");
  assert.equal(params.get("userId"), "nurse");
  assert.equal(params.get("calendarMonth"), "2025-12");
  await testing.act(async () => requests[2].resolve(Response.json(report())));
  assert.ok(view.getByRole("heading", { name: "Test Nurse · 2025 оны 12 сар" }));
  testing.fireEvent.click(view.getByRole("button", { name: "Календарийн дараах сар" }));
  params = new URL(requests[3].url, "http://localhost").searchParams;
  assert.equal(params.get("from"), "2026-01-01");
  assert.equal(params.get("to"), "2026-01-31");
  assert.equal(params.get("userId"), "nurse");
  await testing.act(async () => requests[3].resolve(Response.json(report())));
});

test("checkout failure and older sessions have actionable messages and missing exits show no duration", async () => {
  const { view, requests } = mount(false, true, false);
  assert.match(view.getByRole("alert").textContent ?? "", /Дахин «Гарах»/);
  assert.ok(view.getByText(/Гараад дахин нэвтэрч/));
  const data = report();
  await testing.act(async () => requests[0].resolve(Response.json({ ...data, records: [
    { ...data.records[0], checkOut: null, missedCheckOut: true },
  ] })));
  testing.fireEvent.click(view.getByRole("button", { name: "2026-10-01, 1 бүртгэл" }));
  assert.ok(testing.within(view.getByRole("article")).getByText("Гаралт бүртгээгүй"));
  assert.equal(testing.within(view.getByRole("article")).getAllByText("—").length, 2);
});

test("calendar retains all records beyond 50, expands crowded days and labels overnight exits", async () => {
  const { view, requests } = mount(true);
  const data = report();
  const records = Array.from({ length: 55 }, (_, index) => ({ ...data.records[0], id: `record-${index}` }));
  records.push({ ...data.records[0], id: "overnight", checkIn: "2026-10-01T15:30:00Z", checkOut: "2026-10-01T17:30:00Z" });
  await testing.act(async () => requests[0].resolve(Response.json({ ...data, records })));
  const day = view.getByRole("button", { name: "2026-10-01, 56 бүртгэл" });
  assert.ok(testing.within(day).getByText("Нэмж 54 бүртгэл"));
  assert.ok(testing.within(day).getByText("Нийт 112 цаг 0 мин"));
  testing.fireEvent.click(day);
  assert.equal(view.getAllByRole("article").length, 56);
  assert.ok(view.getByText(/2026.*10.*02.*01:30/));
  testing.fireEvent.click(view.getByRole("button", { name: "2026-10-02, 0 бүртгэл" }));
  assert.ok(view.getByText("Энэ өдөр цагийн бүртгэл алга."));
});

test("employees can navigate calendars only inside a multi-month date filter", async () => {
  const { view, requests } = mount();
  await testing.act(async () => requests[0].resolve(Response.json(report())));
  testing.fireEvent.change(view.getByLabelText("Эхлэх огноо"), { target: { value: "2026-09-15" } });
  testing.fireEvent.click(view.getByRole("button", { name: "Тайлан харах" }));
  await testing.act(async () => requests[1].resolve(Response.json({ ...report(), records: [] })));
  assert.equal((view.getByRole("button", { name: "Календарийн өмнөх сар" }) as HTMLButtonElement).disabled, true);
  testing.fireEvent.click(view.getByRole("button", { name: "Календарийн дараах сар" }));
  const params = new URL(requests[2].url, "http://localhost").searchParams;
  assert.equal(params.get("from"), "2026-09-15");
  assert.equal(params.get("to"), "2026-10-06");
  assert.equal(params.get("calendarMonth"), "2026-10");
  await testing.act(async () => requests[2].resolve(Response.json(report())));
  assert.equal((view.getByRole("button", { name: "Календарийн дараах сар" }) as HTMLButtonElement).disabled, true);
  assert.ok(view.getByRole("button", { name: "2026-10-01, 1 бүртгэл" }));
});
