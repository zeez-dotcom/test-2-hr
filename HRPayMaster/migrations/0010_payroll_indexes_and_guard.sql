-- Add helpful indexes and basic guard against duplicate periods
CREATE INDEX IF NOT EXISTS idx_payroll_runs_start_date ON payroll_runs (start_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_period ON payroll_runs (period);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_run_id ON payroll_entries (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_loans_employee_status ON loans (employee_id, status);

