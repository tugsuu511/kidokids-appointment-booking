export type Role = "ADMIN" | "MANAGER" | "DOCTOR";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};
