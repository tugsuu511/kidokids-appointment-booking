import type { Role } from "@/types/auth";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Админ",
  MANAGER: "Менежер",
  DOCTOR: "Эмч",
  NURSE: "Сувилагч",
};

export const roleDescriptions: Record<Role, string> = {
  ADMIN: "Бүх бүртгэл, үйлчлүүлэгч, ажилтан болон эрхийн удирдлага.",
  MANAGER: "Хяналтын самбар, цаг захиалга, төлбөрийн удирдлага.",
  DOCTOR: "Өөрийн үзлэг, үйлчлүүлэгч болон давтан цагийн бүртгэл.",
  NURSE: "Зөвхөн нэвтрэх эрхтэй. Мэдээлэл харах, өөрчлөх эрхгүй.",
};

export type StaffTypeOption = { id: string; name: string; role: Role };

export type StaffMember = {
  id: string;
  userId: string | null;
  doctorId: string | null;
  fullName: string;
  username: string | null;
  phone: string;
  room: string | null;
  role: Role;
  staffTypeId: string | null;
  isActive: boolean;
};
