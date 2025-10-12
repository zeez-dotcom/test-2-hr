ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mfa_method text,
ADD COLUMN IF NOT EXISTS mfa_totp_secret text,
ADD COLUMN IF NOT EXISTS mfa_backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb;
