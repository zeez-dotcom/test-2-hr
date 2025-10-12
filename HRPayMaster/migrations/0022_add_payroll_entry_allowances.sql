ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS allowances jsonb;
