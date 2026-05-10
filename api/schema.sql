-- ============================================================================
-- Resilience-Is tool — Supabase schema
-- ============================================================================
-- Two new tables:
--   ri_responses           — one row per participant per session
--   ri_word_classifications — shared AI classification cache (cross-session)
--
-- Naming follows the stat_responses pattern (single table, session_code as
-- the discriminator, participant_id as the per-row key in new flow).
-- ============================================================================


-- ============================================================================
-- ri_responses
-- ============================================================================
-- One row per participant per session.
-- A "session" is a single workshop run (e.g. one coupon code, one room).
-- A "participant" is anonymous, identified only by participant_id (UUID).
--
-- Columns:
--   id                   primary key
--   session_code         the coupon/session code (e.g. 'IMI0426')
--   participant_id       UUID assigned in-browser, stable across resume
--   respondent_name      optional display name (local resume only)
--   role                 optional role string (free text)
--   number               sequential participant number for this session (1,2,3...)
--   subject              what's being assessed — defaults 'organisational resilience'
--   words                ordered array of words the participant generated
--                          each entry: { word: string, ts: ISO timestamp }
--   selected             words ticked from the stall list (no order, no timing)
--   forced_pick          the one word they picked as "most essential"
--   primary_quadrant     classification of forced_pick (refine|reinvent|resist|respond|central|outside)
--   first_word_quadrant  classification of words[0] (same vocab)
--   centre_of_gravity    quadrant with the most of this participant's words (same vocab; null if tied/sparse)
--   step                 current step in the flow (for resume)
--   completed            true once they hit join or print
--   join_path            true if they chose join (vs print)
--   email                only present if join_path
--   marketing_opt_in     captured at join time
--   started              first save timestamp
--   updated              last save timestamp
-- ============================================================================

CREATE TABLE IF NOT EXISTS ri_responses (
  id                  bigserial PRIMARY KEY,
  session_code        text NOT NULL,
  participant_id      uuid,
  respondent_name     text,
  role                text,
  number              int,
  subject             text DEFAULT 'organisational resilience',
  words               jsonb DEFAULT '[]'::jsonb,
  selected            jsonb DEFAULT '[]'::jsonb,
  forced_pick         text,
  primary_quadrant    text,
  first_word_quadrant text,
  centre_of_gravity   text,
  step                int DEFAULT 1,
  completed           boolean DEFAULT false,
  join_path           boolean DEFAULT false,
  email               text,
  marketing_opt_in    boolean DEFAULT false,
  started             timestamptz DEFAULT now(),
  updated             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ri_responses_session_idx ON ri_responses (session_code);
CREATE INDEX IF NOT EXISTS ri_responses_participant_idx ON ri_responses (participant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ri_responses_participant_unique
  ON ri_responses (session_code, participant_id)
  WHERE participant_id IS NOT NULL;


-- ============================================================================
-- ri_word_classifications
-- ============================================================================
-- Shared cache of word -> quadrant classifications across all sessions.
-- Same word never gets classified twice. Keyed on the lowercased word/phrase.
--
-- 'source' is either 'dictionary' (hardcoded match) or 'ai' (Anthropic call).
-- 'quadrant' is one of: refine, reinvent, resist, respond, central, outside.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ri_word_classifications (
  word         text PRIMARY KEY,
  quadrant     text NOT NULL,
  source       text NOT NULL CHECK (source IN ('dictionary','ai','manual')),
  reasoning    text,
  created      timestamptz DEFAULT now(),
  CONSTRAINT ri_quadrant_valid CHECK (
    quadrant IN ('refine','reinvent','resist','respond','central','outside')
  )
);


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Browser uses anon key. Browser can INSERT (anonymous participant rows) and
-- UPDATE only its own row (matched by participant_id). The wall view also
-- needs SELECT on ri_responses to render the live wall — restricted to
-- non-sensitive columns by using a view, OR allowed broadly since the
-- session is fundamentally a shared workshop space.
--
-- For v1: simple policy — anon can do everything on ri_responses scoped to
-- session_code. Email is the only sensitive column; we'll suppress it from
-- the wall query in the API layer rather than column-level RLS.
-- ============================================================================

ALTER TABLE ri_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ri_word_classifications ENABLE ROW LEVEL SECURITY;

-- Allow anon to read and write ri_responses (the API enforces session scoping)
DROP POLICY IF EXISTS ri_responses_anon_all ON ri_responses;
CREATE POLICY ri_responses_anon_all ON ri_responses
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon to read the classification cache, but only service role can write
DROP POLICY IF EXISTS ri_classifications_anon_read ON ri_word_classifications;
CREATE POLICY ri_classifications_anon_read ON ri_word_classifications
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS ri_classifications_service_write ON ri_word_classifications;
CREATE POLICY ri_classifications_service_write ON ri_word_classifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
