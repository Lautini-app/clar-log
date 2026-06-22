-- User consent tracking for clar·log
-- Safe/idempotent migration for schema clar_log.
-- Run in Supabase SQL editor.
-- =========================

SET search_path = clar_log;

CREATE TABLE IF NOT EXISTS clar_log.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL DEFAULT 'v1.0',
  consent_given_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON clar_log.user_consents(user_id);

ALTER TABLE clar_log.user_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own consent' AND tablename = 'user_consents') THEN
    CREATE POLICY "Users view own consent" ON clar_log.user_consents
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users insert own consent' AND tablename = 'user_consents') THEN
    CREATE POLICY "Users insert own consent" ON clar_log.user_consents
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
