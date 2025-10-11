CREATE TABLE IF NOT EXISTS shift_templates (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 60,
  expected_minutes integer NOT NULL DEFAULT 480,
  overtime_limit_minutes integer NOT NULL DEFAULT 120,
  color text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_schedules (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id varchar(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  shift_template_id varchar(255) REFERENCES shift_templates(id) ON DELETE SET NULL,
  custom_start_time time,
  custom_end_time time,
  custom_break_minutes integer,
  expected_minutes integer NOT NULL DEFAULT 480,
  overtime_minutes integer NOT NULL DEFAULT 0,
  late_approval_status text NOT NULL DEFAULT 'pending',
  absence_approval_status text NOT NULL DEFAULT 'pending',
  overtime_approval_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT employee_schedule_unique UNIQUE (employee_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS employee_schedules_date_idx ON employee_schedules (schedule_date);
CREATE INDEX IF NOT EXISTS employee_schedules_employee_idx ON employee_schedules (employee_id);
