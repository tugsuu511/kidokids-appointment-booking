CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOut" TIMESTAMP(3),
    "missedCheckOut" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Attendance_time_order" CHECK ("checkOut" IS NULL OR "checkOut" >= "checkIn"),
    CONSTRAINT "Attendance_missing_checkout" CHECK (NOT "missedCheckOut" OR "checkOut" IS NULL)
);

CREATE INDEX "Attendance_userId_checkIn_idx" ON "Attendance"("userId", "checkIn");
CREATE INDEX "Attendance_checkIn_idx" ON "Attendance"("checkIn");
CREATE UNIQUE INDEX "Attendance_one_open_per_user" ON "Attendance"("userId")
    WHERE "checkOut" IS NULL AND "missedCheckOut" = false;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
