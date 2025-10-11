ALTER TABLE generic_documents
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version_group_id varchar DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS previous_version_id varchar REFERENCES generic_documents(id),
  ADD COLUMN IF NOT EXISTS is_latest boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS generated_from_template_key text,
  ADD COLUMN IF NOT EXISTS generated_by_user_id varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signature_status text DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS signature_provider text,
  ADD COLUMN IF NOT EXISTS signature_envelope_id text,
  ADD COLUMN IF NOT EXISTS signature_recipient_email text,
  ADD COLUMN IF NOT EXISTS signature_requested_at timestamp,
  ADD COLUMN IF NOT EXISTS signature_completed_at timestamp,
  ADD COLUMN IF NOT EXISTS signature_declined_at timestamp,
  ADD COLUMN IF NOT EXISTS signature_cancelled_at timestamp,
  ADD COLUMN IF NOT EXISTS signature_metadata jsonb DEFAULT '{}'::jsonb;

UPDATE generic_documents
SET version_group_id = id
WHERE version_group_id IS NULL;

CREATE INDEX IF NOT EXISTS generic_documents_version_group_idx ON generic_documents (version_group_id);
CREATE INDEX IF NOT EXISTS generic_documents_signature_status_idx ON generic_documents (signature_status);
CREATE INDEX IF NOT EXISTS generic_documents_employee_idx ON generic_documents (employee_id);
