CREATE TABLE IF NOT EXISTS "loans" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "employee_id" varchar NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "amount" numeric(12, 2) NOT NULL,
    "remaining_amount" numeric(12, 2) NOT NULL DEFAULT 0,
    "monthly_deduction" numeric(10, 2) NOT NULL,
    "interest_rate" numeric(5, 2) DEFAULT 0,
    "start_date" date NOT NULL,
    "end_date" date,
    "status" text NOT NULL DEFAULT 'pending',
    "approval_state" text NOT NULL DEFAULT 'draft',
    "reason" text,
    "approved_by" varchar REFERENCES "employees"("id") ON DELETE SET NULL,
    "policy_metadata" jsonb DEFAULT '{}'::jsonb,
    "documents_metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_loans_employee_status" ON "loans" ("employee_id", "status");

CREATE TABLE IF NOT EXISTS "loan_approval_stages" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "loan_id" varchar NOT NULL REFERENCES "loans"("id") ON DELETE CASCADE,
    "stage_name" text NOT NULL,
    "stage_order" integer NOT NULL DEFAULT 0,
    "approver_id" varchar REFERENCES "employees"("id") ON DELETE SET NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "acted_at" timestamp,
    "notes" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loan_approval_stages_loan_idx" ON "loan_approval_stages" ("loan_id");
CREATE INDEX IF NOT EXISTS "loan_approval_stages_order_idx" ON "loan_approval_stages" ("loan_id", "stage_order");

CREATE TABLE IF NOT EXISTS "loan_documents" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "loan_id" varchar NOT NULL REFERENCES "loans"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "document_type" text,
    "file_url" text NOT NULL,
    "storage_key" text,
    "uploaded_by" varchar REFERENCES "employees"("id") ON DELETE SET NULL,
    "uploaded_at" timestamp DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "loan_documents_loan_idx" ON "loan_documents" ("loan_id");
CREATE INDEX IF NOT EXISTS "loan_documents_type_idx" ON "loan_documents" ("document_type");

CREATE TABLE IF NOT EXISTS "loan_amortization_schedules" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "loan_id" varchar NOT NULL REFERENCES "loans"("id") ON DELETE CASCADE,
    "installment_number" integer NOT NULL,
    "due_date" date NOT NULL,
    "principal_amount" numeric(12, 2) NOT NULL,
    "interest_amount" numeric(12, 2) NOT NULL,
    "payment_amount" numeric(12, 2) NOT NULL,
    "remaining_balance" numeric(12, 2) NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "payroll_run_id" varchar REFERENCES "payroll_runs"("id") ON DELETE SET NULL,
    "paid_at" date,
    "notes" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loan_amortization_schedules_loan_idx" ON "loan_amortization_schedules" ("loan_id");
CREATE INDEX IF NOT EXISTS "loan_amortization_schedules_due_idx" ON "loan_amortization_schedules" ("loan_id", "due_date");
