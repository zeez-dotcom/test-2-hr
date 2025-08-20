CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

INSERT INTO users (username, password_hash)
VALUES ('admin', '$2b$12$mRlOQRUhpbgqpCkJd.yVhuydr.6XrFOyC.q6YIZM7KpB8NfSoorve');
