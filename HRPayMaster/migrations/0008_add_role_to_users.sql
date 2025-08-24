ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'viewer';
UPDATE users SET role = 'admin' WHERE username = 'admin';
