CREATE TABLE "StaffType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffType_name_key" ON "StaffType"("name");

ALTER TABLE "User"
    ADD COLUMN "staffTypeId" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "User_staffTypeId_idx" ON "User"("staffTypeId");
ALTER TABLE "User" ADD CONSTRAINT "User_staffTypeId_fkey"
    FOREIGN KEY ("staffTypeId") REFERENCES "StaffType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "User" AS u SET "phone" = d."phone"
FROM "Doctor" AS d WHERE d."userId" = u."id";
