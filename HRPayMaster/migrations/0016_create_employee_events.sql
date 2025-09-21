CREATE TABLE IF NOT EXISTS "employee_events" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "employee_id" varchar NOT NULL REFERENCES "employees"("id"),
    "event_type" text NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "amount" numeric(10, 2) NOT NULL DEFAULT 0,
    "event_date" date NOT NULL,
    "affects_payroll" boolean DEFAULT true,
    "document_url" text,
    "status" text NOT NULL DEFAULT 'active',
    "added_by" varchar REFERENCES "employees"("id"),
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "employee_events_employee_id_idx" ON "employee_events" ("employee_id");
CREATE INDEX IF NOT EXISTS "employee_events_event_date_idx" ON "employee_events" ("event_date");
