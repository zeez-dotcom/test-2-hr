ALTER TABLE users ADD COLUMN email text;

INSERT INTO users (username, email, password_hash)
VALUES ('admin', 'admin1@gmail.com', '$2b$12$SCW3YxujUDpPiVkhhG63S.KUNolkgI0cjkfJPe52g0EKJD8rC5sGG')
ON CONFLICT (username) DO UPDATE
  SET email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash;

UPDATE users SET email = username || '@example.com' WHERE email IS NULL;

ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
