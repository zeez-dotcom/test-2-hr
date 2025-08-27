CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

INSERT INTO users (username, password_hash)
VALUES ('admin', '$2b$12$SCW3YxujUDpPiVkhhG63S.KUNolkgI0cjkfJPe52g0EKJD8rC5sGG');
