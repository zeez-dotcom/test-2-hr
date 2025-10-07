ALTER TABLE "employee_events"
ADD COLUMN "recurrence_type" text NOT NULL DEFAULT 'none';

ALTER TABLE "employee_events"
ADD COLUMN "recurrence_end_date" date;
