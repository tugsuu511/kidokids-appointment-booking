export const roleValues = ["ADMIN", "MANAGER", "DOCTOR", "NURSE"] as const;
export type Role = (typeof roleValues)[number];

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  sessionVersion?: number;
  staffTypeName?: string | null;
  attendanceId?: string;
};
