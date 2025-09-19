CREATE TABLE IF NOT EXISTS generic_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id varchar REFERENCES employees(id),
  title text NOT NULL,
  description text,
  document_url text NOT NULL,
  controller_number text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generic_documents_employee ON generic_documents (employee_id);
