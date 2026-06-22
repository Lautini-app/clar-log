-- clar.log — Teen Token Migration: Account-basierter Teen-Flow → Token-Link
-- Einmalig im Supabase SQL-Editor ausführen.
--
-- Voraussetzung: SUPABASE_SETUP_TEEN_TOKENS.sql wurde bereits ausgeführt
-- (teen_tokens, teen_logs Tabellen + resolve_teen_token, submit_teen_log RPCs).
--
-- Diese Migration entfernt den alten Account-basierten Teen-Flow:
-- - Teens brauchen KEIN Konto, KEIN Passwort, KEINE E-Mail
-- - Teens bekommen einen Token-Link wie Beobachter (/tagebuch/$token)
-- - Die family_members / family_invites Tabellen bleiben bestehen (für Observer-Einladungen),
--   aber die Teen-spezifischen RPCs werden entfernt.

-- ─── Alte Teen-Account RPCs entfernen ───────────────────────────────────────────

drop function if exists clar_log.setup_teen_settings(text);
drop function if exists clar_log.get_admin_meds_for_teen();

-- ─── Alte Teen-RLS Policies entfernen (family-basierte Policies) ────────────────
-- Diese Policies erlaubten dem Admin, die Logs/Settings des eingeloggten Teens
-- zu lesen. Da Teens jetzt keinen Account haben, greifen sie nicht mehr.
-- Teen-Logs werden jetzt in clar_log.teen_logs gespeichert (nicht in tracker_logs).

drop policy if exists "family admin read logs" on clar_log.tracker_logs;
drop policy if exists "family admin read settings" on clar_log.tracker_settings;

-- ─── Alte Teen-Einladungen bereinigen ───────────────────────────────────────────
-- family_invites mit role='teen' sind obsolet.

update clar_log.family_invites
  set status = 'expired'
  where role = 'teen' and status = 'pending';
