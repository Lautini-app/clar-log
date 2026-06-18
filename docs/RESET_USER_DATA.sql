-- clar.log — User-Daten zurücksetzen (für Onboarding-Neustart)
-- Im Supabase SQL-Editor ausführen.
-- Löscht alle Logs/Beobachtungen und setzt Settings auf leere Periode zurück.
--
-- Optional: uid-Variable auf eine konkrete UUID setzen statt den neuesten User zu nehmen.

DO $$
DECLARE
  uid uuid;
BEGIN
  -- Neuester User (durch eigene UUID ersetzen falls nötig):
  --   uid := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  SELECT id INTO uid FROM auth.users ORDER BY created_at DESC LIMIT 1;
  RAISE NOTICE 'Reset für User: %', uid;

  -- Tages-Logs
  DELETE FROM clar_log.tracker_logs WHERE user_id = uid;

  -- Observer-Daten
  DELETE FROM clar_log.observer_observations WHERE owner_id = uid;
  DELETE FROM clar_log.observer_links        WHERE owner_id = uid;
  DELETE FROM clar_log.teacher_links         WHERE owner_id = uid;
  DELETE FROM clar_log.observers             WHERE owner_id = uid;

  -- Legacy-Tabellen (falls vorhanden)
  DELETE FROM daily_logs         WHERE user_id = uid;
  DELETE FROM observation_periods WHERE user_id = uid;

  -- Settings zurücksetzen: leere Perioden, kein Kindname, keine Medikamente
  UPDATE clar_log.tracker_settings
  SET
    data       = '{"periods":[],"customWellbeingItems":[],"language":"de"}'::jsonb,
    updated_at = now()
  WHERE user_id = uid;

  -- Fallback: Settings-Zeile anlegen falls noch keine existiert
  INSERT INTO clar_log.tracker_settings (user_id, data)
  VALUES (uid, '{"periods":[],"customWellbeingItems":[],"language":"de"}'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Reset abgeschlossen für %.', uid;
END;
$$;
