-- Run after the enum migration has committed. PostgreSQL does not allow a new
-- enum value to be used in the same transaction that introduced it.
UPDATE "Appointment" AS appointment
SET "status" = 'PAID'
FROM "PaymentOrder" AS payment
WHERE payment."appointmentId" = appointment."id"
  AND payment."status" = 'PAID';
