"use client";

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Clock3, LayoutDashboard, LoaderCircle, Stethoscope, UserRoundCog, UsersRound, UserRound } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { AppointmentRealtimeListener } from "@/components/appointments/appointment-realtime-listener";
import Loading from "@/app/loading";
import { roleLabels } from "@/types/staff";
import type { SessionUser } from "@/types/auth";
import { canAccessAppointmentData } from "@/lib/permissions";

const adminNavItems = [
  { href: "/dashboard", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/appointments", label: "Цаг захиалга", icon: CalendarDays },
  { href: "/patients", label: "Үйлчлүүлэгчид", icon: UsersRound },
  { href: "/doctors", label: "Ажилтны бүртгэл", icon: UserRoundCog },
];

const managerNavItems = adminNavItems.slice(0, 2);
const doctorNavItems = [{ href: "/doctor", label: "Миний үзлэгүүд", icon: Stethoscope }];

const nurseNavItems = [{ href: "/nurse", label: "Сувилагчийн хэсэг", icon: UserRound }];

function NavigationLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span>{label}</span>
    {pending ? <LoaderCircle role="status" aria-label="Хуудас нээж байна" className="ml-auto h-4 w-4 animate-spin" /> : null}
  </>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Pick<SessionUser, "fullName" | "role" | "staffTypeName"> | null>(null);
  const [leavingStaffRegistry, setLeavingStaffRegistry] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const [navigationError, setNavigationError] = useState("");
  const visibleNavItems = user?.role === "DOCTOR"
    ? doctorNavItems
    : user?.role === "ADMIN"
      ? adminNavItems
      : user?.role === "MANAGER"
        ? managerNavItems
        : user?.role === "NURSE" ? nurseNavItems : [];
  const navItems = user ? [...visibleNavItems, {
    href: "/attendance", label: user.role === "ADMIN" ? "Ажилчдын цагийн тайлан" : "Миний цагийн тайлан", icon: Clock3,
  }] : [];

  useEffect(() => {
    if (pathname === "/login") return;

    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : { user: null })
      .then((data) => setUser(data.user ?? null))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setUser(null);
        }
      });

    return () => controller.abort();
  }, [pathname]);

  async function navigateFromStaffRegistry(event: { preventDefault: () => void }, href: string) {
    if (!pathname.startsWith("/doctors") || href === "/doctors") return;

    event.preventDefault();
    if (leavingStaffRegistry || isNavigating) return;
    setLeavingStaffRegistry(true);
    setNavigationError("");
    try {
      const response = await fetch("/api/auth/staff-access", { method: "DELETE" });
      if (!response.ok) throw new Error("Staff access could not be cleared");
      // Wait for Set-Cookie before navigation; show the loading state immediately.
      startNavigation(() => router.push(href));
    } catch {
      setNavigationError("Хуудас шилжүүлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setLeavingStaffRegistry(false);
    }
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {user && canAccessAppointmentData(user.role) ? <AppointmentRealtimeListener /> : null}
      <div className="flex min-h-screen">
        <aside className="w-72 shrink-0 border-r border-sky-100 bg-sky-50 p-5 text-sky-950">
          <div className="mb-8">
            <Image
              src="/uploads/Logo.png"
              alt="Kido Kids"
              width={220}
              height={80}
              className="h-24 w-full object-contain object-center"
              priority
            />
          </div>

          <nav className="space-y-2">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onNavigate={(event) => void navigateFromStaffRegistry(event, href)}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  pathname.startsWith(href)
                    ? "bg-white text-sky-950 shadow-sm"
                    : "text-sky-700 hover:bg-white/80 hover:text-sky-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                <NavigationLabel label={label} />
              </Link>
            ))}
          </nav>

        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div>
              <p className="text-sm text-slate-500">{user?.role === "NURSE" ? "Сувилагчийн хэсэг" : user?.role === "MANAGER" ? "Менежерийн хэсэг" : "Эмнэлгийн удирдлага"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">{user ? `${user.fullName} · ${user.staffTypeName ?? roleLabels[user.role]}` : "..."}</span>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                  Гарах
                </button>
              </form>
            </div>
          </header>

          <main className="p-6" aria-busy={leavingStaffRegistry || isNavigating}>
            {navigationError ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{navigationError}</p> : null}
            {leavingStaffRegistry || isNavigating ? <Loading /> : children}
          </main>
        </div>
      </div>
    </div>
  );
}
