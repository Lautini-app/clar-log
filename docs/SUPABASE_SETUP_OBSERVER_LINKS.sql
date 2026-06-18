-- clar.log — Observer-Links & Home-Beobachtungen (Token-System ohne Login)
-- Einmalig im Supabase SQL-Editor ausführen (Schema: clar_log).
-- Voraussetzung: SUPABASE_SETUP_OBSERVERS.sql wurde bereits ausgeführt.

-- ============================================================
-- 1. Tabelle observer_links
-- ============================================================
-- Speichert 30-Tage-Links für Partner/zweites Elternteil.
-- Kein Login nötig — Beobachter ruft den Link täglich auf.
CREATE TABLE IF NOT EXISTS clar_log.observer_links (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id    uuid        NOT NULL,
  token        text        NOT NULL UNIQUE,
  name         text,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_used_at timestamptz
);

-- ============================================================
-- 2. observer_observations erweitern
-- ============================================================
-- answers: JSONB für Heim-spezifische Felder (home_mood, home_cooperation, …).
-- observer_link_id: Referenz auf den genutzten Observer-Link (anon-Einreichungen).
ALTER TABLE clar_log.observer_observations
  ADD COLUMN IF NOT EXISTS answers         jsonb,
  ADD COLUMN IF NOT EXISTS observer_link_id uuid
    REFERENCES clar_log.observer_links(id) ON DELETE SET NULL;

-- Partieller Unique-Index: ein Eintrag pro Link pro Tag (erlaubt Upsert/Korrektur).
CREATE UNIQUE INDEX IF NOT EXISTS obs_obs_link_date_uniq
  ON clar_log.observer_observations (owner_id, observer_link_id, date)
  WHERE observer_link_id IS NOT NULL;

-- ============================================================
-- 3. Grants
-- ============================================================
GRANT USAGE ON SCHEMA clar_log TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON clar_log.observer_links TO authenticated;
GRANT ALL ON clar_log.observer_links TO service_role;

-- ============================================================
-- 4. Row Level Security für observer_links
-- ============================================================
ALTER TABLE clar_log.observer_links ENABLE ROW LEVEL SECURITY;

-- Owner verwaltet seine eigenen Links (erstellen, rotieren, deaktivieren).
DROP POLICY IF EXISTS "owner manages observer links" ON clar_log.observer_links;
CREATE POLICY "owner manages observer links" ON clar_log.observer_links
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 5. RPC resolve_observer_token
-- ============================================================
-- Öffentlich (kein Login): gibt Owner/Period/Name eines gültigen Observer-Links zurück.
-- Wird von /beobachtung/$token genutzt um den Token-Typ zu erkennen.
CREATE OR REPLACE FUNCTION clar_log.resolve_observer_token(input_token text)
RETURNS TABLE (owner_id uuid, period_id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = clar_log
AS $$
  SELECT owner_id, period_id, name
  FROM clar_log.observer_links
  WHERE token = input_token
    AND active = true
    AND expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION clar_log.resolve_observer_token(text) TO anon, authenticated;

-- ============================================================
-- 6. RPC submit_observer_observation_by_token
-- ============================================================
-- Öffentlich (kein Login): reicht das Elternteil-/Partner-Formular ein.
-- Validiert den Token, schreibt in observer_observations (answers als JSONB).
-- Ein Eintrag pro Link pro Tag — erneute Einreichung überschreibt.
CREATE OR REPLACE FUNCTION clar_log.submit_observer_observation_by_token(
  input_token                     text,
  input_date                      date,
  input_home_mood                 smallint DEFAULT NULL,
  input_home_cooperation          smallint DEFAULT NULL,
  input_home_emotional_regulation smallint DEFAULT NULL,
  input_home_focus_homework       smallint DEFAULT NULL,
  input_home_bedtime_routine      smallint DEFAULT NULL,
  input_home_rebound_observed     boolean  DEFAULT NULL,
  input_note                      text     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = clar_log
AS $$
DECLARE
  link         clar_log.observer_links;
  answers_json jsonb;
BEGIN
  -- Token validieren
  SELECT * INTO link
  FROM clar_log.observer_links
  WHERE token = input_token
    AND active = true
    AND expires_at > now();

  IF link.id IS NULL THEN
    RAISE EXCEPTION 'invalid or expired observer token';
  END IF;

  -- Heim-Felder als JSONB (NULL-Werte werden herausgefiltert)
  answers_json := jsonb_strip_nulls(jsonb_build_object(
    'home_mood',                 input_home_mood,
    'home_cooperation',          input_home_cooperation,
    'home_emotional_regulation', input_home_emotional_regulation,
    'home_focus_homework',       input_home_focus_homework,
    'home_bedtime_routine',      input_home_bedtime_routine,
    'home_rebound_observed',     input_home_rebound_observed
  ));

  -- Eintrag erstellen oder überschreiben (ein Eintrag pro Link pro Tag)
  INSERT INTO clar_log.observer_observations
    (owner_id, period_id, date, observer_name, observer_link_id, answers, note)
  VALUES
    (link.owner_id, link.period_id, input_date,
     COALESCE(link.name, 'Beobachter'),
     link.id,
     answers_json,
     input_note)
  ON CONFLICT (owner_id, observer_link_id, date)
    WHERE observer_link_id IS NOT NULL
  DO UPDATE SET
    answers       = EXCLUDED.answers,
    observer_name = EXCLUDED.observer_name,
    note          = EXCLUDED.note;

  -- Nutzungszeitpunkt aktualisieren
  UPDATE clar_log.observer_links
  SET last_used_at = now()
  WHERE id = link.id;
END;
$$;

GRANT EXECUTE ON FUNCTION clar_log.submit_observer_observation_by_token(
  text, date, smallint, smallint, smallint, smallint, smallint, boolean, text
) TO anon, authenticated;
