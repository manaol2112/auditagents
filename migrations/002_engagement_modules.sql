-- Engagement scope: the methodology modules this engagement plans against. NULL means every module of the pinned methodology.
-- Scoping is a G1 decision recorded with the engagement (event engagement.create); the plan lists the modules left out of scope.
ALTER TABLE engagements ADD COLUMN modules JSONB;
