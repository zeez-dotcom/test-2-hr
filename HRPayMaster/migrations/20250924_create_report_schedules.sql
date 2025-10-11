CREATE TABLE IF NOT EXISTS report_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  report_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  groupings jsonb NOT NULL DEFAULT '[]'::jsonb,
  export_format text NOT NULL DEFAULT 'json',
  cadence text NOT NULL DEFAULT 'monthly',
  run_time time,
  timezone text NOT NULL DEFAULT 'UTC',
  delivery_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  notify_employee_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by varchar REFERENCES users(id),
  status text NOT NULL DEFAULT 'active',
  last_run_status text,
  last_run_summary text,
  last_run_at timestamp,
  next_run_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx
  ON report_schedules (next_run_at)
  WHERE status = 'active';
