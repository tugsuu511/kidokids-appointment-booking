import type { Role } from "@/types/auth";

export function roleHomePath(role: Role) {
  if (role === "NURSE") return "/nurse";
  if (role === "DOCTOR") return "/doctor";
  return "/dashboard";
}

export function canAccessAppointmentData(role: Role) {
  return role === "ADMIN" || role === "MANAGER" || role === "DOCTOR";
}
