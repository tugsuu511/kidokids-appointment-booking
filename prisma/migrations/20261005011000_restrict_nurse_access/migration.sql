BEGIN;

-- Correct the existing nurse type without changing its ID or staff assignments.
UPDATE "StaffType"
SET "role" = 'NURSE'
WHERE LOWER(BTRIM("name")) = LOWER('Сувилагч');

-- Revoke all previously issued manager sessions for affected staff.
UPDATE "User" AS u
SET "role" = 'NURSE',
    "sessionVersion" = u."sessionVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "StaffType" AS t
WHERE u."staffTypeId" = t."id"
  AND t."role" = 'NURSE'
  AND u."role" <> 'NURSE';

UPDATE "Doctor" AS d
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "User" AS u
WHERE d."userId" = u."id" AND u."role" = 'NURSE' AND d."isActive";

COMMIT;
