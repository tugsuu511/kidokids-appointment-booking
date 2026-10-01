import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode } from "react";

import { AppointmentsClient } from "../src/app/appointments/appointments-client";
import { DailyAppointments } from "../src/components/appointments/daily-appointments";
import { DashboardSummary } from "../src/components/appointments/dashboard-summary";
import { appointmentChangedEventName } from "../src/components/appointments/appointment-realtime-listener";
import type { DashboardSummaryData } from "../src/lib/dashboard";
import {
  appointmentStatusOptions,
  canTransitionAppointmentStatus,
  manuallySelectableAppointmentStatusOptions,
  type Appointment,
} from "../src/lib/appointments";

let testing: typeof import("@testing-library/react");
const originalFetch = globalThis.fetch;
const appointment: Appointment = {
  id: "existing-booking",
  appointmentDate: "2026-09-28T16:00:00.000Z",
  startTime: "09:00",
  endTime: "09:30",
  status: "BOOKED",
  patient: {
    id: "patient-example",
    registerNo: null,
    firstName: "Example",
    lastName: "",
    phone: "",
    birthDate: null,
    gender: null,
    address: null,
    notes: null,
  },
  doctor: { id: "doctor-uran", fullName: "Б. Уран" },
  service: { name: "Хүүхдийн эмчийн үзлэг" },
};
const slots = [{ startTime: "09:00", endTime: "09:30", status: "BOOKED" }];

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    FormData: dom.window.FormData,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  testing = await import("@testing-library/react");
});

afterEach(() => {
  testing.cleanup();
  globalThis.fetch = originalFetch;
});

function mockAvailability() {
  const requests: {
    url: string;
    method: string;
    body: RequestInit["body"];
    signal: AbortSignal | null | undefined;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
  }[] = [];
  globalThis.fetch = (_url, init) => new Promise<Response>((resolve, reject) => {
    requests.push({ url: String(_url), method: init?.method ?? "GET", body: init?.body, signal: init?.signal, resolve, reject });
  });
  return requests;
}

function mount(initialAppointments = [appointment]) {
  const view = testing.render(<AppointmentsClient
    initialDate="2026-09-28"
    initialAppointments={initialAppointments}
    doctors={[{ id: "doctor-uran", label: "Б. Уран" }, { id: "other-doctor", label: "Өөр эмч" }]}
    services={[{ id: "service", label: "Хүүхдийн эмчийн үзлэг" }]}
  />);
  testing.fireEvent.click(view.getByRole("button", { name: "Шинэ захиалга" }));
  testing.fireEvent.change(view.getByLabelText("Огноо"), { target: { value: "2026-09-28" } });
  return view;
}

test("appointment statuses follow one forward-only workflow", () => {
  assert.deepEqual(appointmentStatusOptions("BOOKED"), ["BOOKED", "CONFIRMED", "CANCELLED", "NO_SHOW"]);
  assert.deepEqual(appointmentStatusOptions("CONFIRMED"), ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"]);
  assert.deepEqual(appointmentStatusOptions("ARRIVED"), ["ARRIVED", "COMPLETED"]);
  assert.deepEqual(appointmentStatusOptions("COMPLETED"), ["COMPLETED", "PAID"]);
  assert.deepEqual(appointmentStatusOptions("PAID"), ["PAID"]);
  assert.equal(canTransitionAppointmentStatus("BOOKED", "ARRIVED"), false);
  assert.equal(canTransitionAppointmentStatus("COMPLETED", "ARRIVED"), false);
  assert.deepEqual(manuallySelectableAppointmentStatusOptions("ARRIVED"), ["ARRIVED"]);
  assert.deepEqual(manuallySelectableAppointmentStatusOptions("COMPLETED"), ["COMPLETED"]);
});

test("September 28, Uran, 09:00 is blocked immediately and after availability loads", async () => {
  const requests = mockAvailability();
  const view = mount();
  const booked = view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement;
  assert.equal(booked.disabled, true);
  assert.ok(booked.className.includes("bg-amber-100"));
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, true);

  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: slots })));
  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "09:30 сонгох" }) as HTMLButtonElement).disabled, false);
  assert.ok(view.getByText("Энэ цаг захиалагдсан. Сонгох боломжгүй.").className.includes("text-red-600"));
});

test("failed availability never unlocks booked slots or submit, and retry recovers", async () => {
  const requests = mockAvailability();
  const view = mount();
  await testing.act(async () => requests.at(-1)!.reject(new Error("Connection lost")));

  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "09:30 сонгох" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, true);
  assert.match(view.getByRole("alert").textContent ?? "", /Connection lost/);

  testing.fireEvent.click(view.getByRole("button", { name: "Дахин шалгах" }));
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: slots })));
  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "09:30 сонгох" }) as HTMLButtonElement).disabled, false);
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, false);
});

test("changing doctor/date blocks submission and ignores previous selection's late response", async () => {
  const requests = mockAvailability();
  const view = mount();
  const oldDoctorRequest = requests.at(-1)!;
  testing.fireEvent.change(view.getByLabelText("Эмч"), { target: { value: "other-doctor" } });
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, true);
  assert.equal(oldDoctorRequest.signal?.aborted, true);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [] })));
  await testing.act(async () => oldDoctorRequest.resolve(Response.json({ appointments: slots })));
  assert.equal((view.getByRole("button", { name: "09:00 сонгох" }) as HTMLButtonElement).disabled, false);

  testing.fireEvent.change(view.getByLabelText("Огноо"), { target: { value: "2026-09-29" } });
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, true);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [{ startTime: "09:15", endTime: "09:45", status: "BOOKED" }] })));
  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "09:30 захиалагдсан" }) as HTMLButtonElement).disabled, true);
});

test("availability blocks bookings absent from the first page of the list", async () => {
  const requests = mockAvailability();
  const view = mount([]);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: slots })));
  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
});

test("slot status colors preserve blocking rules and cancelled history cannot hide an active booking", async () => {
  const requests = mockAvailability();
  const view = mount([]);
  const cases = [
    { startTime: "08:30", endTime: "09:00", status: "BOOKED", color: "bg-amber-100", blocked: true },
    { startTime: "09:00", endTime: "09:30", status: "CONFIRMED", color: "bg-cyan-100", blocked: true },
    { startTime: "09:30", endTime: "10:00", status: "ARRIVED", color: "bg-blue-100", blocked: true },
    { startTime: "10:30", endTime: "11:00", status: "CANCELLED", color: "bg-red-100", blocked: false },
    { startTime: "11:00", endTime: "11:30", status: "NO_SHOW", color: "bg-slate-100", blocked: false },
  ];
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({
    appointments: [{ startTime: "09:00", endTime: "09:30", status: "CANCELLED" }, ...cases],
  })));
  for (const { startTime, color, blocked } of cases) {
    const button = view.getByRole("button", { name: `${startTime} ${blocked ? "захиалагдсан" : "сонгох"}` }) as HTMLButtonElement;
    assert.equal(button.disabled, blocked);
    assert.ok(button.className.includes(color));
  }
  testing.fireEvent.click(view.getByRole("button", { name: "10:30 сонгох" }));
  assert.equal(view.container.querySelector<HTMLInputElement>('input[name="startTime"]')!.value, "10:30");
});

test("a conflict created by another user refreshes availability and locks the newly booked time", async () => {
  const requests = mockAvailability();
  const view = mount([]);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [] })));
  testing.fireEvent.click(view.getByRole("button", { name: "09:00 сонгох" }));
  testing.fireEvent.change(view.getByLabelText("Өвчтөний нэр"), { target: { value: "Example" } });
  testing.fireEvent.submit(view.getByLabelText("Өвчтөний нэр").closest("form")!);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ error: "Already booked" }, { status: 409 })));
  assert.equal((view.getByRole("button", { name: "Хадгалах" }) as HTMLButtonElement).disabled, true);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: slots })));
  assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  assert.equal(view.container.querySelector<HTMLInputElement>('input[name="startTime"]')!.value, "08:30");
});

for (const bookingDate of ["2026-09-28", "2026-10-01"]) {
  test(`saving a booking for ${bookingDate} shows it immediately without a realtime event`, async () => {
    const requests = mockAvailability();
    const view = mount([]);
    await testing.act(async () => requests[0].resolve(Response.json({ appointments: [] })));
    if (bookingDate !== "2026-09-28") {
      testing.fireEvent.change(view.getByLabelText("Огноо"), { target: { value: bookingDate } });
    }
    await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [] })));
    testing.fireEvent.change(view.getByLabelText("Өвчтөний нэр"), { target: { value: "New patient" } });
    testing.fireEvent.click(view.getByRole("button", { name: "09:00 сонгох" }));
    testing.fireEvent.submit(view.getByLabelText("Өвчтөний нэр").closest("form")!);

    const saveRequest = requests.at(-1)!;
    assert.equal(saveRequest.method, "POST");
    const body = JSON.parse(String(saveRequest.body));
    assert.equal(body.appointmentDate, bookingDate);
    assert.equal(body.startTime, "09:00");
    assert.equal(body.endTime, "09:30");
    const requestCount = requests.length;
    const created = {
      ...appointment,
      id: "new-booking",
      appointmentDate: `${bookingDate}T00:00:00.000Z`,
      patient: { ...appointment.patient, firstName: "New patient" },
    };
    await testing.act(async () => saveRequest.resolve(Response.json({ appointment: created }, { status: 201 })));

    assert.equal(view.queryByLabelText("Өвчтөний нэр"), null);
    const refreshRequest = requests.slice(requestCount).find((request) => request.url === `/api/appointments?date=${bookingDate}`);
    assert.ok(refreshRequest, "a successful save must reload the booked day's list without waiting for SSE");
    assert.equal((view.getByLabelText("Огноогоор шүүх") as HTMLInputElement).value, bookingDate);
    await testing.act(async () => refreshRequest.resolve(Response.json({ appointments: [created] })));
    assert.ok(view.getByText("New patient"));
    assert.match(view.getByRole("status").textContent ?? "", /Захиалга амжилттай үүслээ/);

    testing.fireEvent.click(view.getByRole("button", { name: "Шинэ захиалга" }));
    assert.equal((view.getByLabelText("Огноо") as HTMLInputElement).value, bookingDate);
    await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: slots })));
    assert.equal((view.getByRole("button", { name: "09:00 захиалагдсан" }) as HTMLButtonElement).disabled, true);
  });
}

test("daily list shows only the selected date and arrows load every booking across year boundaries", async () => {
  const requests = mockAvailability();
  const todayBooking = { ...appointment, id: "today", appointmentDate: "2026-01-01T00:00:00.000Z", patient: { ...appointment.patient, firstName: "Today patient" } };
  const yesterdayBooking = { ...appointment, id: "yesterday", appointmentDate: "2025-12-31T00:00:00.000Z", patient: { ...appointment.patient, firstName: "Yesterday patient" } };
  const view = testing.render(<DailyAppointments initialDate="2026-01-01" initialAppointments={[todayBooking, yesterdayBooking]} />);
  assert.ok(view.getByText("Today patient"));
  assert.equal(view.queryByText("Yesterday patient"), null);
  assert.equal((view.getByLabelText("Огноогоор шүүх") as HTMLInputElement).value, "2026-01-01");

  testing.fireEvent.click(view.getByRole("button", { name: "Өмнөх өдөр" }));
  assert.equal((view.getByLabelText("Огноогоор шүүх") as HTMLInputElement).value, "2025-12-31");
  assert.equal(view.queryByText("Today patient"), null);
  assert.equal(requests.at(-1)!.url, "/api/appointments?date=2025-12-31");
  const dayBookings = Array.from({ length: 105 }, (_, index) => ({ ...yesterdayBooking, id: `booking-${index}`, patient: { ...appointment.patient, firstName: `Patient ${index}` } }));
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: dayBookings })));
  assert.equal(view.getAllByRole("row").length, 106);
  assert.ok(view.getByText("Patient 104"));

  testing.fireEvent.click(view.getByRole("button", { name: "Дараагийн өдөр" }));
  assert.equal((view.getByLabelText("Огноогоор шүүх") as HTMLInputElement).value, "2026-01-01");
  assert.equal(view.queryByText("Patient 104"), null);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [todayBooking] })));
  assert.ok(view.getByText("Today patient"));
});

test("rapid day navigation ignores stale responses and a failed day cannot show another day's rows", async () => {
  const requests = mockAvailability();
  const view = testing.render(<DailyAppointments initialDate="2026-09-28" initialAppointments={[appointment]} />);
  testing.fireEvent.click(view.getByRole("button", { name: "Дараагийн өдөр" }));
  const oldRequest = requests.at(-1)!;
  testing.fireEvent.click(view.getByRole("button", { name: "Дараагийн өдөр" }));
  assert.equal(oldRequest.signal?.aborted, true);
  await testing.act(async () => requests.at(-1)!.resolve(Response.json({ appointments: [] })));
  await testing.act(async () => oldRequest.resolve(Response.json({ appointments: [{ ...appointment, appointmentDate: "2026-09-29T00:00:00.000Z" }] })));
  assert.equal(view.queryByText("Example"), null);
  assert.ok(view.getByText("Энэ өдөр захиалга байхгүй."));

  testing.fireEvent.click(view.getByRole("button", { name: "Дараагийн өдөр" }));
  await testing.act(async () => requests.at(-1)!.reject(new Error("Day lookup failed")));
  assert.equal(view.queryByText("Example"), null);
  assert.match(view.getByRole("alert").textContent ?? "", /Day lookup failed/);
  assert.equal((view.getByLabelText("Огноогоор шүүх") as HTMLInputElement).value, "2026-10-01");
});

test("SSR daily data skips the initial fetch even under Strict Mode, but events and local saves refresh it", async () => {
  const requests = mockAvailability();
  const renderList = (refreshVersion: number) => <StrictMode><DailyAppointments initialDate="2026-09-28" initialAppointments={[appointment]} refreshVersion={refreshVersion} /></StrictMode>;
  const view = testing.render(renderList(0));
  assert.equal(requests.length, 0);
  assert.ok(view.getByText("Example"));

  testing.act(() => window.dispatchEvent(new window.CustomEvent(appointmentChangedEventName, {
    detail: { appointmentDate: "2026-09-29", action: "created" },
  })));
  assert.equal(requests.length, 0, "another date must not reload this list");
  testing.act(() => window.dispatchEvent(new window.CustomEvent(appointmentChangedEventName, {
    detail: { appointmentDate: "2026-09-28", action: "status-updated" },
  })));
  assert.equal(requests.length, 1);
  await testing.act(async () => requests[0].resolve(Response.json({ appointments: [] })));
  assert.equal(view.queryByText("Example"), null);
  view.rerender(renderList(1));
  assert.equal(requests.length, 2, "a successful local save must still invalidate SSR data");
});

const summary: DashboardSummaryData = {
  date: "2026-09-28", todayCount: 1, byStatus: { BOOKED: 1 },
  pendingCount: 0, pendingAmount: "0", orders: [],
};

function dispatchChange(action: string, appointmentDate = summary.date) {
  window.dispatchEvent(new window.CustomEvent(appointmentChangedEventName, { detail: { action, appointmentDate } }));
}

test("dashboard uses SSR data and coalesces realtime bursts into a summary-only request", async () => {
  const requests = mockAvailability();
  const view = testing.render(<StrictMode><DashboardSummary initialData={summary} /></StrictMode>);
  assert.equal(requests.length, 0);
  testing.act(() => dispatchChange("created", "2026-10-01"));
  await testing.act(async () => new Promise((resolve) => setTimeout(resolve, 280)));
  assert.equal(requests.length, 0);

  testing.act(() => {
    dispatchChange("created");
    dispatchChange("status-updated");
    dispatchChange("payment-updated");
  });
  await testing.waitFor(() => assert.equal(requests.length, 1));
  assert.equal(requests[0].url, "/api/dashboard");
  await testing.act(async () => requests[0].resolve(Response.json({ ...summary, todayCount: 9 })));
  assert.ok(view.getByText("9"));
});

test("dashboard aborts superseded summaries, ignores late data, and preserves the snapshot after failure", async () => {
  const requests = mockAvailability();
  const view = testing.render(<DashboardSummary initialData={summary} />);
  testing.act(() => dispatchChange("status-updated"));
  await testing.waitFor(() => assert.equal(requests.length, 1));
  testing.act(() => dispatchChange("payment-updated"));
  assert.equal(requests[0].signal?.aborted, true);
  await testing.waitFor(() => assert.equal(requests.length, 2));
  await testing.act(async () => requests[1].resolve(Response.json({ ...summary, todayCount: 7 })));
  await testing.act(async () => requests[0].resolve(Response.json({ ...summary, todayCount: 99 })));
  assert.ok(view.getByText("7"));
  assert.equal(view.queryByText("99"), null);

  testing.act(() => dispatchChange("payment-updated"));
  await testing.waitFor(() => assert.equal(requests.length, 3));
  await testing.act(async () => requests[2].reject(new Error("Offline")));
  assert.ok(view.getByRole("alert"));
  assert.ok(view.getByText("7"));
  testing.fireEvent.click(view.getByRole("button", { name: "Дахин авах" }));
  await testing.waitFor(() => assert.equal(requests.length, 4));
  await testing.act(async () => requests[3].resolve(Response.json(summary)));
  assert.equal(view.queryByRole("alert"), null);
});

test("a local payment refreshes both summary and appointments without waiting for SSE", async () => {
  const requests = mockAvailability();
  const paidAppointment = { ...appointment, status: "COMPLETED" as const };
  const order = {
    id: "payment-1", amount: "10000", description: null, status: "PENDING" as const,
    updatedAt: "2026-09-28T00:00:00Z",
    appointment: {
      appointmentDate: "2026-09-28", status: "COMPLETED" as const,
      patient: appointment.patient, doctor: appointment.doctor, service: appointment.service,
    },
  };
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    const view = testing.render(<>
      <DashboardSummary initialData={{ ...summary, pendingCount: 1, pendingAmount: "10000", orders: [order] }} />
      <DailyAppointments initialDate={summary.date} initialAppointments={[paidAppointment]} />
    </>);
    assert.equal(requests.length, 0);
    testing.fireEvent.click(view.getByRole("button", { name: "Төлөгдсөн болгох" }));
    assert.equal(requests[0].method, "PATCH");
    await testing.act(async () => requests[0].resolve(Response.json({ paymentOrder: {
      appointmentId: appointment.id, appointmentDate: summary.date, doctorId: appointment.doctor.id,
    } })));
    await testing.waitFor(() => assert.ok(requests.some((request) => request.url === "/api/dashboard")));
    assert.ok(requests.some((request) => request.url === `/api/appointments?date=${summary.date}`));
    assert.equal(view.queryByRole("button", { name: "Төлөгдсөн болгох" }), null);
  } finally {
    window.confirm = originalConfirm;
  }
});
