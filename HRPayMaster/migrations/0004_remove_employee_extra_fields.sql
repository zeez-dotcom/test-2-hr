ALTER TABLE "employees"
  DROP COLUMN IF EXISTS "group1",
  DROP COLUMN IF EXISTS "group2",
  DROP COLUMN IF EXISTS "additions",
  DROP COLUMN IF EXISTS "command",
  DROP COLUMN IF EXISTS "salary_deductions",
  DROP COLUMN IF EXISTS "fines",
  DROP COLUMN IF EXISTS "total_loans",
  DROP COLUMN IF EXISTS "bonuses",
  DROP COLUMN IF EXISTS "vacation_return_date",
  DROP COLUMN IF EXISTS "rec_salary_vacation",
  RENAME COLUMN "company" TO "residency_name";
