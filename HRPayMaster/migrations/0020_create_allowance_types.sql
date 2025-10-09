CREATE TABLE IF NOT EXISTS allowance_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  created_at timestamp DEFAULT now()
);
