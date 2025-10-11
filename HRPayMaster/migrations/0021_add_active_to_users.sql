ALTER TABLE users
ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

UPDATE users
SET active = true
WHERE active IS NULL;
