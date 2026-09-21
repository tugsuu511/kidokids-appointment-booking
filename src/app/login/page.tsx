import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <Image
            src="/uploads/Logo.png"
            alt="Kido Kids"
            width={280}
            height={100}
            className="mx-auto h-20 w-full object-contain"
            priority
          />
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Нэвтрэх</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
