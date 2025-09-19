-- Create templates table for editable document templates
CREATE TABLE IF NOT EXISTS templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  en text NOT NULL,
  ar text NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

