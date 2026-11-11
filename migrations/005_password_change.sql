-- Temporary passwords. A password set by anyone other than its owner (an administrator's reset, a new account, a demo
-- seed) must be changed by the owner at the next sign-in; until then the API allows only reading one's own account,
-- changing the password, and signing out.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
