-- ============================================================================
-- Shared email consent + audit log for the clar ecosystem
-- ============================================================================
-- Run ONCE in the shared Supabase project (public schema is cross-app).
-- Tables live in `public` and are queried from every clar app
-- (clar·markt, clar·heim, clar·log, clar·tag, home.lautini.ch).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. email_consent
-- ----------------------------------------------------------------------------
-- One row per auth user. Captures GDPR-style consent decision for
-- marketing email. Transactional mail (login, password reset, receipts)
-- is NOT gated by this — those always go.

CREATE TABLE IF NOT EXISTS public.email_consent (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_level    text NOT NULL CHECK (consent_level IN ('always', 'subscription_only', 'never')),
  consented_at     timestamptz NOT NULL DEFAULT now(),
  consent_version  integer NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_consent_level
  ON public.email_consent (consent_level);

ALTER TABLE public.email_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own consent" ON public.email_consent;
CREATE POLICY "users can read own consent"
  ON public.email_consent FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can write own consent" ON public.email_consent;
CREATE POLICY "users can write own consent"
  ON public.email_consent FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. audit_log
-- ----------------------------------------------------------------------------
-- Append-only log of privacy-relevant actions. Survives user deletion
-- (user_id is NOT cascading — it's set to NULL after the auth user is gone).
-- This is the GDPR evidence trail (Art. 7 (1) Nachweispflicht).

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
  ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own log entries (for transparency / data export).
DROP POLICY IF EXISTS "users read own audit" ON public.audit_log;
CREATE POLICY "users read own audit"
  ON public.audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Users may insert log rows tagged with their own user_id (logged from the
-- client when an action originates there, e.g. consent change). Server-side
-- (service-role) writes bypass RLS and can log on the user's behalf with
-- any user_id (including NULL after deletion).
DROP POLICY IF EXISTS "users insert own audit" ON public.audit_log;
CREATE POLICY "users insert own audit"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies: rows are immutable from the client side.
