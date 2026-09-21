export type Role = "ADMIN" | "RECEPTIONIST" | "DOCTOR";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};
