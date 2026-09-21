"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/appointments", label: "Цаг захиалга", icon: CalendarDays },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-72 border-r border-slate-200 bg-slate-900 p-5 text-white">
          <div className="mb-8">
            <Image
              src="/uploads/Logo.png"
              alt="Kido Kids"
              width={220}
              height={80}
              className="h-16 w-full object-contain object-left"
              priority
            />
            <h2 className="mt-2 text-2xl font-bold">Эмнэлгийн систем</h2>
          </div>

          <nav className="space-y-2">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-10 rounded-lg border border-slate-700 bg-slate-800 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Бүртгэлтэй</p>
            <p className="mt-2 font-medium">Админ</p>
            <p className="text-sm text-slate-300">ADMIN</p>
          </div>
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
