-- Fehlende Lese-Funktion für das Jugendlichen-Tagebuch (/tagebuch/$token).
-- Ohne sie zeigte die Seite nach dem Neuladen einen leeren Tag, und der
-- nächste Eintrag überschrieb die bereits erfassten Zeitfenster
-- (submit_teen_log ersetzt den ganzen Tag). Am 07.11.2026 direkt im
-- Projekt eingespielt; diese Datei hält den Stand im Repo fest.
create or replace function clar_log.get_teen_log(input_token text, input_date text)
returns jsonb
language plpgsql
security definer
set search_path to 'clar_log', 'public'
as $$
declare
  v_token record;
  v_data  jsonb;
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token and active = true and expires_at > now()
  limit 1;

  if not found then return null; end if;

  select data into v_data
  from clar_log.teen_logs
  where teen_token_id = v_token.id and date = input_date
  limit 1;

  return v_data;
end;
$$;

revoke all on function clar_log.get_teen_log(text, text) from public;
grant execute on function clar_log.get_teen_log(text, text) to anon, authenticated;
