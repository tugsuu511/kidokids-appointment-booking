ALTER TYPE "UserRole" RENAME VALUE 'RECEPTIONIST' TO 'MANAGER';

UPDATE "User"
SET
  "username" = CASE
    WHEN NOT EXISTS (SELECT 1 FROM "User" AS manager_user WHERE manager_user."username" = 'manager') THEN 'manager'
    ELSE "username"
  END,
  "fullName" = CASE
    WHEN "fullName" = 'Ресепшн ажилтан' THEN 'Manager'
    ELSE "fullName"
  END
WHERE "username" = 'receptionist';
