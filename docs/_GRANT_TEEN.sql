GRANT SELECT, INSERT, UPDATE, DELETE ON clar_log.teen_tokens TO authenticated;
GRANT SELECT ON clar_log.teen_tokens TO anon;

GRANT SELECT, INSERT, UPDATE ON clar_log.teen_logs TO authenticated;
GRANT INSERT ON clar_log.teen_logs TO anon;
