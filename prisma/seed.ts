import { PrismaClient, AppointmentStatus, Gender, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.appointment.deleteMany();
  await prisma.doctorSchedule.deleteMany();
  await prisma.service.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.department.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = await bcrypt.hash("Admin123!", 10);
  const receptionistPassword = await bcrypt.hash("Reception123!", 10);
  const doctorPassword = await bcrypt.hash("Doctor123!", 10);

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: adminPassword,
      fullName: "Админ",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const receptionist = await prisma.user.create({
    data: {
      username: "receptionist",
      passwordHash: receptionistPassword,
      fullName: "Ресепшн ажилтан",
      role: UserRole.RECEPTIONIST,
      isActive: true,
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      username: "doctor",
      passwordHash: doctorPassword,
      fullName: "Эмч Наран",
      role: UserRole.DOCTOR,
      isActive: true,
    },
  });

  const pediatric = await prisma.department.create({
    data: { name: "Хүүхдийн эмч", isActive: true },
  });

  const vacc = await prisma.department.create({
    data: { name: "Дархлаажуулалт", isActive: true },
  });

  const doctor1 = await prisma.doctor.create({
    data: {
      fullName: "Д. Наран",
      licenseNo: "LIC-1001",
      phone: "+976-99112233",
      room: "A-101",
      departmentId: pediatric.id,
      isActive: true,
    },
  });

  const doctor2 = await prisma.doctor.create({
    data: {
      fullName: "Б. Уран",
      licenseNo: "LIC-1002",
      phone: "+976-99112234",
      room: "A-102",
      departmentId: vacc.id,
      isActive: true,
    },
  });

  const service1 = await prisma.service.create({
    data: {
      name: "Хүүхдийн эмчийн үзлэг",
      durationMin: 30,
      price: 45000,
      departmentId: pediatric.id,
      isActive: true,
    },
  });

  const service2 = await prisma.service.create({
    data: {
      name: "Давтан үзлэг",
      durationMin: 20,
      price: 25000,
      departmentId: pediatric.id,
      isActive: true,
    },
  });

  const service3 = await prisma.service.create({
    data: {
      name: "Дархлаажуулалтын зөвлөгөө",
      durationMin: 15,
      price: 20000,
      departmentId: vacc.id,
      isActive: true,
    },
  });

  await prisma.doctorSchedule.createMany({
    data: [
      { doctorId: doctor1.id, dayOfWeek: 1, startTime: "09:00", endTime: "18:00", slotMinutes: 30, isActive: true },
      { doctorId: doctor1.id, dayOfWeek: 2, startTime: "09:00", endTime: "18:00", slotMinutes: 30, isActive: true },
      { doctorId: doctor2.id, dayOfWeek: 1, startTime: "10:00", endTime: "16:00", slotMinutes: 30, isActive: true },
      { doctorId: doctor2.id, dayOfWeek: 3, startTime: "10:00", endTime: "16:00", slotMinutes: 30, isActive: true },
    ],
  });

  const patient1 = await prisma.patient.create({
    data: {
      registerNo: "P-1001",
      firstName: "Бат",
      lastName: "Эрдэнэ",
      phone: "+976-99001111",
      birthDate: new Date("2019-05-04T00:00:00Z"),
      gender: Gender.MALE,
      address: "Улаанбаатар, Сүхбаатар",
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      registerNo: "P-1002",
      firstName: "Гэрэл",
      lastName: "Оюун",
      phone: "+976-99002222",
      birthDate: new Date("2017-07-18T00:00:00Z"),
      gender: Gender.FEMALE,
      address: "Улаанбаатар, Хан-Уул",
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      registerNo: "P-1003",
      firstName: "Мөнх",
      lastName: "Төгс",
      phone: "+976-99003333",
      birthDate: new Date("2020-11-29T00:00:00Z"),
      gender: Gender.OTHER,
      address: "Улаанбаатар, Баянзүрх",
    },
  });

  const patient4 = await prisma.patient.create({
    data: {
      registerNo: "P-1004",
      firstName: "Анхиа",
      lastName: "Сүхбат",
      phone: "+976-99004444",
      birthDate: new Date("2016-02-17T00:00:00Z"),
      gender: Gender.FEMALE,
      address: "Улаанбаатар, Чингэлтэй",
    },
  });

  const patient5 = await prisma.patient.create({
    data: {
      registerNo: "P-1005",
      firstName: "Тэмүүлэн",
      lastName: "Болд",
      phone: "+976-99005555",
      birthDate: new Date("2018-09-12T00:00:00Z"),
      gender: Gender.MALE,
      address: "Улаанбаатар, Баянхошуу",
    },
  });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  await prisma.appointment.createMany({
    data: [
      {
        appointmentDate: today,
        startTime: "09:00",
        endTime: "09:30",
        patientId: patient1.id,
        doctorId: doctor1.id,
        serviceId: service1.id,
        status: AppointmentStatus.BOOKED,
      },
      {
        appointmentDate: today,
        startTime: "09:30",
        endTime: "10:00",
        patientId: patient2.id,
        doctorId: doctor1.id,
        serviceId: service2.id,
        status: AppointmentStatus.CONFIRMED,
      },
      {
        appointmentDate: today,
        startTime: "11:00",
        endTime: "11:30",
        patientId: patient3.id,
        doctorId: doctor2.id,
        serviceId: service3.id,
        status: AppointmentStatus.ARRIVED,
      },
      {
        appointmentDate: tomorrow,
        startTime: "10:00",
        endTime: "10:30",
        patientId: patient4.id,
        doctorId: doctor1.id,
        serviceId: service1.id,
        status: AppointmentStatus.BOOKED,
      },
      {
        appointmentDate: tomorrow,
        startTime: "11:00",
        endTime: "11:30",
        patientId: patient5.id,
        doctorId: doctor2.id,
        serviceId: service3.id,
        status: AppointmentStatus.COMPLETED,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, action: "login", entity: "User", entityId: admin.id, details: "Админ системд нэвтэрсэн" },
      { userId: receptionist.id, action: "create appointment", entity: "Appointment", details: "Эхний цаг захиалга үүсгэв" },
      { userId: doctorUser.id, action: "update appointment status", entity: "Appointment", details: "Ирсэн төлөвийг шинэчлэх" },
    ],
  });

  await prisma.setting.createMany({
    data: [
      { key: "clinic_name", value: "Kido Kids Эмнэлэг" },
      { key: "clinic_phone", value: "+976-7000-0000" },
      { key: "clinic_address", value: "Улаанбаатар, Сүхбаатар дүүрэг" },
      { key: "working_hours", value: "09:00-18:00" },
    ],
  });

  console.log("Seed data inserted successfully.");
  console.log("Demo logins: admin / Admin123!, receptionist / Reception123!, doctor / Doctor123!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
