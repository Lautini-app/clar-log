-- ============================================================================
-- Table-level GRANTs for public.email_consent and public.audit_log
-- ============================================================================
-- Supabase ships with RLS-enabled tables but does NOT auto-grant base
-- privileges to the `authenticated` role. Without these GRANTs, requests
-- from the supabase-js client fail with 403 even when RLS would allow them.
-- (USAGE on schema public is already granted in the default Supabase setup.)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.email_consent TO authenticated;
-- Service role bypasses RLS and grants but be explicit anyway:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_consent TO service_role;

-- audit_log: append-only from the client (RLS already restricts to own user_id).
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;
