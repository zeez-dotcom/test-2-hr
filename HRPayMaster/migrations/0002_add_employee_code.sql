ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code varchar;
UPDATE employees SET employee_code = id WHERE employee_code IS NULL;
ALTER TABLE employees ALTER COLUMN employee_code SET NOT NULL;
ALTER TABLE employees ADD CONSTRAINT employees_employee_code_unique UNIQUE (employee_code);
