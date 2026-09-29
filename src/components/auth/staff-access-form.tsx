"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StaffAccessForm({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(setup ? "/api/auth/staff-password" : "/api/auth/staff-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup ? { newPassword: password, confirmPassword } : { password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Нууц үг баталгаажуулах үед алдаа гарлаа.");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Нууц үг баталгаажуулах үед алдаа гарлаа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="staff-access-password">{setup ? "Шинэ нууц үг" : "Нууц үг"}</Label>
        <Input
          id="staff-access-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
      </div>
      {setup ? <div className="space-y-2">
        <Label htmlFor="staff-access-confirm-password">Нууц үг давтах</Label>
        <Input
          id="staff-access-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div> : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        {setup ? "Нууц үг үүсгэх" : "Баталгаажуулах"}
      </Button>
    </form>
  );
}
