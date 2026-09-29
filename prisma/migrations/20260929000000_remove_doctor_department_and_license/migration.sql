-- Remove the Doctor-to-Department relationship and the doctor's license field.
ALTER TABLE "Doctor" DROP CONSTRAINT "Doctor_departmentId_fkey";

DROP INDEX "Doctor_departmentId_idx";
DROP INDEX "Doctor_licenseNo_key";

ALTER TABLE "Doctor"
  DROP COLUMN "departmentId",
  DROP COLUMN "licenseNo";
