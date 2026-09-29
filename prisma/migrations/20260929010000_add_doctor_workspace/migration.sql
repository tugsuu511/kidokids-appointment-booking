CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

ALTER TABLE "Doctor" ADD COLUMN "userId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "followUpOfId" TEXT;

CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");
CREATE INDEX "Appointment_followUpOfId_idx" ON "Appointment"("followUpOfId");

ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VisitRecord" (
  "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitRecord_appointmentId_key" ON "VisitRecord"("appointmentId");
CREATE INDEX "VisitRecord_doctorId_updatedAt_idx" ON "VisitRecord"("doctorId", "updatedAt");
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "amount" DECIMAL(10,2) NOT NULL, "description" TEXT,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentOrder_appointmentId_key" ON "PaymentOrder"("appointmentId");
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
