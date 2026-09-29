"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, LayoutDashboard, UserRoundCog } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { AppointmentRealtimeListener } from "@/components/appointments/appointment-realtime-listener";

const navItems = [
  { href: "/dashboard", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/appointments", label: "Цаг захиалга", icon: CalendarDays },
  { href: "/doctors", label: "Ажилтны бүртгэл", icon: UserRoundCog },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function navigateFromStaffRegistry(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!pathname.startsWith("/doctors") || href === "/doctors") return;

    event.preventDefault();
    try {
      await fetch("/api/auth/staff-access", { method: "DELETE" });
    } finally {
      router.push(href);
      router.refresh();
    }
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <AppointmentRealtimeListener />
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
                onClick={(event) => void navigateFromStaffRegistry(event, href)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-white/80 hover:text-sky-950"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

        </aside>

        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div>
              <p className="text-sm text-slate-500">Эмнэлгийн удирдлага</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">ADMIN</span>
              <Link href="/api/auth/logout" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Гарах
              </Link>
            </div>
          </header>

          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
