import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";

import { AppShell } from "../src/components/layout/app-shell";
import type { Role } from "../src/types/auth";

let testing: typeof import("@testing-library/react");
const originalFetch = globalThis.fetch;
let eventStreamCount = 0;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/doctors" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, self: dom.window,
    HTMLElement: dom.window.HTMLElement, HTMLAnchorElement: dom.window.HTMLAnchorElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    EventSource: class { constructor() { eventStreamCount++; } addEventListener() {} removeEventListener() {} close() {} },
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  testing = await import("@testing-library/react");
});

afterEach(() => {
  testing.cleanup();
  globalThis.fetch = originalFetch;
  eventStreamCount = 0;
});

function mount(role: Role = "ADMIN", pathname = "/doctors") {
  const navigations: string[] = [];
  const requests: { resolve: (response: Response) => void; url: string; method?: string }[] = [];
  globalThis.fetch = (url, init) => {
    if (String(url) === "/api/auth/session") return Promise.resolve(Response.json({
      user: { role, fullName: "Test user" },
    }));
    return new Promise<Response>((resolve) => requests.push({ resolve, url: String(url), method: init?.method }));
  };
  const router: AppRouterInstance = {
    bfcacheId: "test-navigation",
    back() {}, forward() {}, refresh() {}, replace() {}, prefetch() {},
    push(href) { navigations.push(href); },
  };
  // Node resolves next/link to the Pages entry; Next's app bundler aliases it.
  // Supply that context as well so Link still exercises its real onNavigate.
  const linkRouter: NextRouter = {
    basePath: "", pathname: "/doctors", route: "/doctors", asPath: "/doctors", query: {},
    push: async () => true, replace: async () => true, reload() {}, back() {}, forward() {},
    prefetch: async () => {}, beforePopState() {},
    events: { on() {}, off() {}, emit() {} },
    isFallback: false, isReady: true, isPreview: false, isLocaleDomain: false,
  };
  const view = testing.render(<AppRouterContext.Provider value={router}>
    <RouterContext.Provider value={linkRouter}><PathnameContext.Provider value={pathname}>
      <AppShell><p>Staff registry content</p></AppShell>
    </PathnameContext.Provider></RouterContext.Provider>
  </AppRouterContext.Provider>);
  return { view, requests, navigations };
}

test("leaving staff registry immediately shows loading and waits for access revocation", async () => {
  const { view, requests, navigations } = mount();
  await testing.act(async () => {});
  testing.fireEvent.click(view.getByRole("link", { name: "Цаг захиалга" }));
  assert.ok(view.getByRole("status", { name: "Хуудсыг ачаалж байна" }));
  assert.equal(view.queryByText("Staff registry content"), null);
  assert.equal(navigations.length, 0);
  assert.equal(requests[0].url, "/api/auth/staff-access");
  assert.equal(requests[0].method, "DELETE");
  await testing.act(async () => requests[0].resolve(Response.json({ success: true })));
  assert.deepEqual(navigations, ["/appointments"]);
});

test("failed staff access revocation keeps the user on the page and permits retry", async () => {
  const { view, requests, navigations } = mount();
  await testing.act(async () => {});
  testing.fireEvent.click(view.getByRole("link", { name: "Цаг захиалга" }));
  await testing.act(async () => requests[0].resolve(Response.json({}, { status: 503 })));
  assert.equal(navigations.length, 0);
  assert.ok(view.getByRole("alert"));
  assert.ok(view.getByText("Staff registry content"));
  testing.fireEvent.click(view.getByRole("link", { name: "Цаг захиалга" }));
  await testing.act(async () => requests[1].resolve(Response.json({ success: true })));
  assert.deepEqual(navigations, ["/appointments"]);
});

test("nurses have only their landing page and never open the appointment event stream", async () => {
  const { view } = mount("NURSE", "/nurse");
  assert.equal(view.queryByRole("link", { name: "Хяналтын самбар" }), null);
  await testing.act(async () => {});
  assert.equal(view.getAllByRole("link").length, 1);
  assert.ok(view.getByRole("link", { name: "Сувилагчийн хэсэг" }));
  assert.equal(view.queryByRole("link", { name: "Цаг захиалга" }), null);
  assert.equal(view.queryByRole("link", { name: "Ажилтны бүртгэл" }), null);
  assert.equal(view.queryByRole("link", { name: "Үйлчлүүлэгчид" }), null);
  assert.equal(eventStreamCount, 0);
});
