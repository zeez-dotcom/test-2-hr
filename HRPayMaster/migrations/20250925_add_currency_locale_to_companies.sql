ALTER TABLE "companies"
  ADD COLUMN "currency_code" text NOT NULL DEFAULT 'KWD',
  ADD COLUMN "locale" text NOT NULL DEFAULT 'en-KW';

-- Ensure existing rows receive defaults
UPDATE "companies"
SET "currency_code" = COALESCE("currency_code", 'KWD'),
    "locale" = COALESCE("locale", 'en-KW');
