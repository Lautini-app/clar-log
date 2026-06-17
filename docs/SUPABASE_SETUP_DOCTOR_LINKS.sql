-- clar.log Arzt-Link Tabelle (einmalig im Supabase SQL Editor ausführen)
-- Projekt: cgwpzpnklxphqxlixtva

CREATE TABLE IF NOT EXISTS clar_log.doctor_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA clar_log TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON clar_log.doctor_links TO authenticated;
GRANT SELECT ON clar_log.doctor_links TO anon;
GRANT ALL ON clar_log.doctor_links TO service_role;

ALTER TABLE clar_log.doctor_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages doctor links" ON clar_log.doctor_links;
CREATE POLICY "owner manages doctor links"
  ON clar_log.doctor_links FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION clar_log.resolve_doctor_token(input_token text)
RETURNS TABLE (owner_id uuid, period_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = clar_log AS $$
  SELECT owner_id, period_id FROM clar_log.doctor_links
  WHERE token = input_token AND active = true AND expires_at > now();
$$;
GRANT EXECUTE ON FUNCTION clar_log.resolve_doctor_token(text) TO anon, authenticated;

-- Lesezugriff auf tracker_settings und tracker_logs für Arzt-Token
-- (via RPC - kein direkter Zugriff ohne user_id)
