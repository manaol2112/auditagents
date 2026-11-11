-- Administrator role and retired accounts.
-- An administrator manages people and access (users, passwords, roles, engagement membership) but does not prepare or
-- approve audit work: segregation of duties between granting access and signing off plans.
-- A retired account keeps its name (the audit trail refers to it) but can no longer sign in.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('agent', 'reader', 'preparer', 'approver', 'admin'));
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN disabled_by TEXT;
