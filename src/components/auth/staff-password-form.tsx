"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StaffPasswordForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/staff-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Нууц үг солих үед алдаа гарлаа.");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Нууц үг амжилттай солигдлоо.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Нууц үг солих үед алдаа гарлаа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" className="mt-5" onClick={() => setIsOpen(true)}>
        <KeyRound className="h-4 w-4" />
        Нууц үг солих
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-sm space-y-4 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Ажилтны бүртгэлийн нууц үг солих</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}>Хаах</Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-staff-password">Шинэ нууц үг</Label>
        <Input id="new-staff-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-new-staff-password">Нууц үг давтах</Label>
        <Input id="confirm-new-staff-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Нууц үг солих
      </Button>
    </form>
  );
}
