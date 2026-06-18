-- clar.log — Named Links Migration
-- Fügt name-Feld zu teacher_links hinzu und aktualisiert resolve_teacher_token
-- sowie submit_teacher_observation, damit der Name der Lehrperson gespeichert wird.
-- Einmalig im Supabase SQL-Editor ausführen.

-- ============================================================
-- 1. name-Spalte zu teacher_links hinzufügen
-- ============================================================
ALTER TABLE clar_log.teacher_links
  ADD COLUMN IF NOT EXISTS name text;

-- ============================================================
-- 2. resolve_teacher_token — gibt jetzt auch name zurück
-- ============================================================
CREATE OR REPLACE FUNCTION clar_log.resolve_teacher_token(input_token text)
RETURNS TABLE (owner_id uuid, period_id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = clar_log
AS $$
  SELECT owner_id, period_id, name
  FROM clar_log.teacher_links
  WHERE token = input_token
    AND active = true
    AND expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION clar_log.resolve_teacher_token(text) TO anon, authenticated;

-- ============================================================
-- 3. submit_teacher_observation — speichert link.name statt 'Lehrperson'
-- ============================================================
CREATE OR REPLACE FUNCTION clar_log.submit_teacher_observation(
  input_token          text,
  input_date           date,
  input_mood           smallint,
  input_behavior       smallint,
  input_concentration  smallint,
  input_note           text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = clar_log
AS $$
DECLARE
  link clar_log.teacher_links;
BEGIN
  SELECT * INTO link
  FROM clar_log.teacher_links
  WHERE token = input_token
    AND active = true
    AND expires_at > now();

  IF link.id IS NULL THEN
    RAISE EXCEPTION 'invalid or expired token';
  END IF;

  INSERT INTO clar_log.observer_observations
    (owner_id, period_id, date, observer_name, mood, behavior, concentration, note)
  VALUES
    (link.owner_id, link.period_id, input_date,
     COALESCE(link.name, 'Lehrperson'),
     input_mood, input_behavior, input_concentration, input_note)
  ON CONFLICT (owner_id, observer_user_id, date) DO UPDATE SET
    observer_name  = EXCLUDED.observer_name,
    mood           = EXCLUDED.mood,
    behavior       = EXCLUDED.behavior,
    concentration  = EXCLUDED.concentration,
    note           = EXCLUDED.note;
END;
$$;

GRANT EXECUTE ON FUNCTION clar_log.submit_teacher_observation(text, date, smallint, smallint, smallint, text) TO anon, authenticated;
