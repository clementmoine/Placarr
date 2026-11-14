-- Accent-insensitive item search (« epees » ↔ « épées »).
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION placarr_fold(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent(coalesce(t, '')));
$$;
