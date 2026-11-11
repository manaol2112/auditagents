-- SOX ITGC planning engine schema. The database, not the agent, enforces: approved plan versions never
-- change; plan content never changes after it is written; the audit trail is append-only; snapshot records,
-- reviews, findings and model proposals are immutable; human dispositions are final.

CREATE TABLE users (
    name TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('agent', 'approver', 'reader'))
);

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail JSONB NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    fiscal_year_end TEXT NOT NULL,
    time_zone TEXT NOT NULL
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('rcm', 'narrative', 'policy')),
    sha256 TEXT NOT NULL,
    ingested_by TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);

CREATE TABLE document_lines (
    doc_id INTEGER NOT NULL REFERENCES documents(id),
    line_no INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (doc_id, line_no)
);

CREATE TABLE snapshots (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    record_hash TEXT NOT NULL
);

-- L2 records. Every content field is backed by a fact with a source reference.
CREATE TABLE risks (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    ref TEXT NOT NULL,
    statement TEXT NOT NULL,
    element TEXT NOT NULL,
    assertions TEXT NOT NULL,
    category TEXT NOT NULL,
    doc_id INTEGER NOT NULL,
    line_no INTEGER NOT NULL
);

CREATE TABLE controls (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    control_id TEXT NOT NULL,
    identity_basis TEXT NOT NULL CHECK (identity_basis IN ('client', 'provisional')),
    ref TEXT NOT NULL,
    description TEXT NOT NULL,
    control_type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    owner TEXT NOT NULL,
    systems JSONB NOT NULL,
    risk_refs JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    doc_id INTEGER NOT NULL,
    line_no INTEGER NOT NULL
);

CREATE TABLE facts (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    subject_type TEXT NOT NULL,
    subject_ref TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    basis TEXT NOT NULL CHECK (basis IN ('extracted', 'confirmed', 'asserted')),
    fact_class TEXT NOT NULL,
    doc_id INTEGER NOT NULL,
    line_no INTEGER NOT NULL
);

-- Identity issues and links between a snapshot's controls and the prior snapshot's. Human-resolved.
CREATE TABLE identity_links (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    control_id TEXT NOT NULL,
    issue_type TEXT NOT NULL CHECK (issue_type IN ('exact', 'proposed_match', 'ambiguous_match', 'new', 'duplicate', 'identifier_conflict')),
    prior_snapshot_id INTEGER,
    prior_control_id TEXT,
    candidates JSONB NOT NULL DEFAULT '[]',
    score DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('auto', 'pending', 'resolved')),
    decision TEXT,
    resolution TEXT,
    resolved_by TEXT,
    resolved_at TEXT
);

CREATE TABLE engagements (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    name TEXT NOT NULL UNIQUE,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    as_of TEXT NOT NULL,
    systems JSONB NOT NULL,
    methodology_version TEXT NOT NULL,
    methodology_hash TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE plan_versions (
    id SERIAL PRIMARY KEY,
    engagement_id INTEGER NOT NULL REFERENCES engagements(id),
    version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
    content JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    decided_by TEXT,
    decided_at TEXT,
    decision_note TEXT,
    supersedes INTEGER,
    revision_of INTEGER,
    review_cycle INTEGER NOT NULL DEFAULT 0,
    UNIQUE (engagement_id, version)
);

CREATE TABLE contradictions (
    id SERIAL PRIMARY KEY,
    engagement_id INTEGER NOT NULL REFERENCES engagements(id),
    control_ref TEXT NOT NULL,
    subject TEXT NOT NULL,
    sources JSONB NOT NULL,
    sources_hash TEXT NOT NULL DEFAULT '',
    materiality TEXT NOT NULL CHECK (materiality IN ('material', 'immaterial')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'stale')),
    stale_reason TEXT,
    chosen_source TEXT,
    resolution TEXT,
    resolved_by TEXT,
    resolved_at TEXT,
    UNIQUE (engagement_id, control_ref, subject)
);

CREATE TABLE model_proposals (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    proposer TEXT NOT NULL,
    model TEXT NOT NULL,
    content JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    usage JSONB NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Independent review: one row per review pass, findings as notes. Findings are never edited; status moves forward only.
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    engagement_id INTEGER NOT NULL REFERENCES engagements(id),
    plan_version_id INTEGER NOT NULL REFERENCES plan_versions(id),
    cycle INTEGER NOT NULL,
    reviewer TEXT NOT NULL,
    pass1_hash TEXT NOT NULL,
    pass1 JSONB NOT NULL,
    pass2_hash TEXT NOT NULL,
    pass2 JSONB NOT NULL,
    usage JSONB NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE review_notes (
    id SERIAL PRIMARY KEY,
    review_id INTEGER NOT NULL REFERENCES reviews(id),
    plan_version_id INTEGER NOT NULL REFERENCES plan_versions(id),
    cycle INTEGER NOT NULL,
    control_id TEXT NOT NULL,
    code TEXT NOT NULL,
    category TEXT NOT NULL,
    significance TEXT NOT NULL CHECK (significance IN ('high', 'medium', 'low')),
    source JSONB NOT NULL,
    verified BOOLEAN NOT NULL,
    rationale TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'unverified', 'accepted_by_planner', 'rejected_by_planner', 'resolved', 'escalated', 'accepted_by_human', 'dismissed_by_human')),
    planner_response JSONB,
    fix_check JSONB,
    human_decision TEXT,
    human_by TEXT,
    human_at TEXT,
    created_at TEXT NOT NULL
);

-- Observable activity log: one row per task step, with input and output references.
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    engagement_id INTEGER,
    task TEXT NOT NULL,
    step TEXT NOT NULL,
    actor TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
    input_refs JSONB NOT NULL,
    output_refs JSONB NOT NULL,
    detail JSONB NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
);

-- Immutability enforced at the database, not in prompts or application code.
CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER events_no_update BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION refuse('audit trail is append-only');
CREATE TRIGGER events_no_delete BEFORE DELETE ON events FOR EACH ROW EXECUTE FUNCTION refuse('audit trail is append-only');

CREATE FUNCTION plan_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'approved' THEN
        RAISE EXCEPTION 'approved plan versions are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content OR NEW.content_hash <> OLD.content_hash OR NEW.version <> OLD.version
       OR NEW.engagement_id <> OLD.engagement_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'plan content is immutable; create a new version' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER plan_versions_guard BEFORE UPDATE ON plan_versions FOR EACH ROW EXECUTE FUNCTION plan_versions_guard();
CREATE TRIGGER plan_no_delete BEFORE DELETE ON plan_versions FOR EACH ROW EXECUTE FUNCTION refuse('plan versions cannot be deleted');

CREATE TRIGGER snapshot_records_immutable BEFORE UPDATE ON controls FOR EACH ROW EXECUTE FUNCTION refuse('snapshot records are immutable; extract a new snapshot');
CREATE TRIGGER facts_immutable BEFORE UPDATE ON facts FOR EACH ROW EXECUTE FUNCTION refuse('facts are immutable');

CREATE FUNCTION identity_links_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'resolved' THEN
        RAISE EXCEPTION 'identity resolutions are not overwritten' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER identity_resolution_immutable BEFORE UPDATE ON identity_links FOR EACH ROW EXECUTE FUNCTION identity_links_guard();

CREATE TRIGGER reviews_immutable BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION refuse('reviews are immutable');

CREATE FUNCTION review_notes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.control_id <> OLD.control_id OR NEW.code <> OLD.code OR NEW.category <> OLD.category OR NEW.significance <> OLD.significance
       OR NEW.source IS DISTINCT FROM OLD.source OR NEW.verified <> OLD.verified OR NEW.rationale <> OLD.rationale
       OR NEW.suggested_action <> OLD.suggested_action OR NEW.review_id <> OLD.review_id OR NEW.plan_version_id <> OLD.plan_version_id THEN
        RAISE EXCEPTION 'review findings are immutable; only status and dispositions change' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status <> OLD.status AND OLD.status IN ('accepted_by_human', 'dismissed_by_human') THEN
        RAISE EXCEPTION 'a human disposition is final' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER review_notes_guard BEFORE UPDATE ON review_notes FOR EACH ROW EXECUTE FUNCTION review_notes_guard();

CREATE TRIGGER proposals_immutable BEFORE UPDATE ON model_proposals FOR EACH ROW EXECUTE FUNCTION refuse('model proposals are immutable');

INSERT INTO users (name, role) VALUES ('planner-agent', 'agent'), ('reviewer-agent', 'agent');
