-- RCM upload and mapping, intake findings, sign-in, background jobs, and a concurrency-safe audit chain.

-- Audit chain head: every event insert locks this row (SELECT ... FOR UPDATE) until its transaction commits, so concurrent
-- writers append to the chain one after another instead of both linking to the same previous event.
CREATE TABLE event_chain_head (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_id BIGINT,
    hash TEXT NOT NULL
);
INSERT INTO event_chain_head (id, last_id, hash)
SELECT 1, (SELECT id FROM events ORDER BY id DESC LIMIT 1),
       COALESCE((SELECT hash FROM events ORDER BY id DESC LIMIT 1), repeat('0', 64));

-- People sign in; agents do not. 'preparer' prepares (uploads, maps, plans) but cannot decide.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('agent', 'preparer', 'approver', 'reader'));
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    csrf_hash TEXT NOT NULL,
    user_name TEXT NOT NULL REFERENCES users(name),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- An engagement exists before its documents; the snapshot is pinned when an RCM is extracted.
ALTER TABLE engagements ALTER COLUMN snapshot_id DROP NOT NULL;

-- Access: a person sees an engagement (and its client's records) only as a member of it. Deny by default.
CREATE TABLE engagement_members (
    engagement_id INTEGER NOT NULL REFERENCES engagements(id),
    user_name TEXT NOT NULL REFERENCES users(name),
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (engagement_id, user_name)
);
ALTER TABLE clients ADD COLUMN created_by TEXT;

-- Uploaded RCM files: the original bytes, kept unchanged.
CREATE TABLE rcm_uploads (
    id SERIAL PRIMARY KEY,
    engagement_id INTEGER NOT NULL REFERENCES engagements(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    doc_id INTEGER NOT NULL REFERENCES documents(id),
    filename TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content BYTEA NOT NULL,
    sheets JSONB NOT NULL,
    proposal JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'mapped', 'extracted')),
    snapshot_id INTEGER REFERENCES snapshots(id),
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    UNIQUE (engagement_id, sha256)
);

-- Every non-empty row of every sheet, with its cells by column letter; line_no is the row's line in the upload's document.
CREATE TABLE rcm_rows (
    upload_id INTEGER NOT NULL REFERENCES rcm_uploads(id),
    sheet TEXT NOT NULL,
    row_no INTEGER NOT NULL,
    line_no INTEGER NOT NULL,
    cells JSONB NOT NULL,
    PRIMARY KEY (upload_id, sheet, row_no)
);

-- Confirmed column mappings: each confirmation is a new version; none is overwritten.
CREATE TABLE rcm_mappings (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER NOT NULL REFERENCES rcm_uploads(id),
    version INTEGER NOT NULL,
    mapping JSONB NOT NULL,
    confirmed_by TEXT NOT NULL,
    confirmed_at TEXT NOT NULL,
    UNIQUE (upload_id, version)
);

-- Canonical records extracted from an RCM (every category, including those not yet planned).
CREATE TABLE rcm_records (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    upload_id INTEGER NOT NULL REFERENCES rcm_uploads(id),
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    fields JSONB NOT NULL,
    client_attributes JSONB NOT NULL,
    source JSONB NOT NULL,
    UNIQUE (snapshot_id, kind, key)
);

CREATE TABLE intake_findings (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER NOT NULL REFERENCES rcm_uploads(id),
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    severity TEXT NOT NULL CHECK (severity IN ('blocking', 'warning', 'info')),
    check_code TEXT NOT NULL,
    record_kind TEXT NOT NULL,
    record_key TEXT,
    field TEXT,
    message TEXT NOT NULL,
    source JSONB,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted_by_human')),
    human_note TEXT,
    human_by TEXT,
    human_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'review', 'mapping')),
    engagement_id INTEGER REFERENCES engagements(id),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    params JSONB NOT NULL,
    result JSONB,
    error TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);

-- Controls carry their category and methodology module when the source states them (RCM uploads).
ALTER TABLE controls ADD COLUMN category TEXT;
ALTER TABLE controls ADD COLUMN module TEXT;
-- Facts from a spreadsheet keep the exact cell they came from.
ALTER TABLE facts ADD COLUMN cell JSONB;

-- Immutability, as for the other records.
CREATE TRIGGER rcm_uploads_content_immutable BEFORE UPDATE OF content, sha256, filename, engagement_id, client_id, doc_id, uploaded_by, uploaded_at ON rcm_uploads
    FOR EACH ROW EXECUTE FUNCTION refuse('uploaded files are immutable; upload a new version');
CREATE TRIGGER rcm_uploads_no_delete BEFORE DELETE ON rcm_uploads FOR EACH ROW EXECUTE FUNCTION refuse('uploads cannot be deleted');
CREATE TRIGGER rcm_rows_immutable BEFORE UPDATE OR DELETE ON rcm_rows FOR EACH ROW EXECUTE FUNCTION refuse('uploaded rows are immutable');
CREATE TRIGGER rcm_mappings_immutable BEFORE UPDATE OR DELETE ON rcm_mappings FOR EACH ROW EXECUTE FUNCTION refuse('confirmed mappings are immutable; confirm a new version');
CREATE TRIGGER rcm_records_immutable BEFORE UPDATE OR DELETE ON rcm_records FOR EACH ROW EXECUTE FUNCTION refuse('extracted records are immutable; extract a new snapshot');

CREATE FUNCTION intake_findings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.severity <> OLD.severity OR NEW.check_code <> OLD.check_code OR NEW.message <> OLD.message OR NEW.record_kind <> OLD.record_kind
       OR NEW.record_key IS DISTINCT FROM OLD.record_key OR NEW.upload_id <> OLD.upload_id OR NEW.snapshot_id <> OLD.snapshot_id THEN
        RAISE EXCEPTION 'intake findings are immutable; only a human decision is recorded' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'accepted_by_human' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'a human decision is final' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER intake_findings_guard BEFORE UPDATE ON intake_findings FOR EACH ROW EXECUTE FUNCTION intake_findings_guard();
CREATE TRIGGER intake_findings_no_delete BEFORE DELETE ON intake_findings FOR EACH ROW EXECUTE FUNCTION refuse('intake findings cannot be deleted');
