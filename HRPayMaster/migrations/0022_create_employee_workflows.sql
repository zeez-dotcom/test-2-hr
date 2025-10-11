CREATE TABLE IF NOT EXISTS "employee_workflows" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "employee_id" varchar NOT NULL REFERENCES "employees"("id"),
    "workflow_type" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "started_at" timestamp,
    "completed_at" timestamp,
    "initiated_by" varchar REFERENCES "employees"("id"),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "employee_workflows_employee_id_idx" ON "employee_workflows" ("employee_id");
CREATE INDEX IF NOT EXISTS "employee_workflows_type_idx" ON "employee_workflows" ("workflow_type");
CREATE INDEX IF NOT EXISTS "employee_workflows_status_idx" ON "employee_workflows" ("status");

CREATE TABLE IF NOT EXISTS "employee_workflow_steps" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_id" varchar NOT NULL REFERENCES "employee_workflows"("id") ON DELETE CASCADE,
    "step_key" text NOT NULL,
    "step_type" text NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "status" text NOT NULL DEFAULT 'pending',
    "order_index" integer NOT NULL DEFAULT 0,
    "due_date" date,
    "completed_at" timestamp,
    "notes" text,
    "resource_id" varchar,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "employee_workflow_steps_workflow_id_idx" ON "employee_workflow_steps" ("workflow_id");
CREATE INDEX IF NOT EXISTS "employee_workflow_steps_key_idx" ON "employee_workflow_steps" ("step_key");
