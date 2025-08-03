ALTER TABLE employees ADD COLUMN IF NOT EXISTS role text DEFAULT 'employee' NOT NULL;
UPDATE employees SET role = 'employee' WHERE role IS NULL;
