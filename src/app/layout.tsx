import type { Metadata } from "next";
import { Roboto } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Kido Kids - Эмнэлгийн захиалгын систем",
  description: "Мэдрэлийн болон хүүхдийн эмнэлгийн цаг захиалгын удирдлагын систем",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="mn"
      className={`${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
