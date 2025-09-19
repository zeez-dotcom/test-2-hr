ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "use_attendance_for_deductions" boolean NOT NULL DEFAULT false;
