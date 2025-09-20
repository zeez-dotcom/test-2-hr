CREATE TABLE IF NOT EXISTS "loan_payments" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "loan_id" varchar NOT NULL REFERENCES "loans"("id") ON DELETE CASCADE,
    "payroll_run_id" varchar NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
    "employee_id" varchar NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "amount" numeric(10, 2) NOT NULL,
    "applied_date" date NOT NULL DEFAULT CURRENT_DATE,
    "source" text NOT NULL DEFAULT 'payroll',
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loan_payments_loan_id_idx" ON "loan_payments" ("loan_id");
CREATE INDEX IF NOT EXISTS "loan_payments_payroll_run_id_idx" ON "loan_payments" ("payroll_run_id");
CREATE INDEX IF NOT EXISTS "loan_payments_employee_id_idx" ON "loan_payments" ("employee_id");
