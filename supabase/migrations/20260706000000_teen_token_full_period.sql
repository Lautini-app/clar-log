-- clar.log — Teen-Token: volle Tagesabfrage für Jugendliche
-- ============================================================
-- Vorher: resolve_teen_token gab nur Medikamente + Name zurück.
-- Der Token-Fragebogen war deshalb ein Kurzformular (Energie/Stimmung).
--
-- Jetzt: resolve_teen_token liefert die vollständige Perioden-Konfiguration
-- (Katalog, Slots, Profil, Module, Zeitfenster) — der Jugendliche bekommt
-- exakt die gleiche Tagesabfrage wie der Kontoinhaber, mit Teen-Fragenkatalog.
--
-- submit_teen_log akzeptiert bereits beliebiges jsonb; wir dokumentieren hier
-- zusätzlich, dass die Payload jetzt eine komplette DayLog-Struktur ist.
--
-- Sicherheit:
-- • RPCs sind SECURITY DEFINER, aber sie schreiben ausschließlich in die dem
--   Token zugeordnete (owner_id, period_id) — kein Cross-Period-Write möglich.
-- • Anon liest nur aktive, nicht abgelaufene Tokens.
-- ============================================================

-- ─── resolve_teen_token: jetzt mit vollem Perioden-Kontext ────────────────
create or replace function clar_log.resolve_teen_token(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_token    record;
  v_period   jsonb;
  v_settings jsonb;
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token
    and active = true
    and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  -- Aktuelle Periode aus observation_periods laden.
  select data into v_period
  from clar_log.observation_periods
  where user_id = v_token.owner_id
    and id = v_token.period_id
  limit 1;

  -- Fallback: aus tracker_settings.periods das passende Objekt ziehen.
  if v_period is null then
    select data into v_settings
    from clar_log.tracker_settings
    where user_id = v_token.owner_id
    limit 1;

    if v_settings is not null then
      select elem into v_period
      from jsonb_array_elements(coalesce(v_settings->'periods', '[]'::jsonb)) elem
      where elem->>'id' = v_token.period_id
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'owner_id',    v_token.owner_id::text,
    'period_id',   v_token.period_id,
    'name',        v_token.name,
    'period_name', coalesce(v_period->>'name', ''),
    'medications', coalesce(v_period->'medications', '[]'::jsonb),
    -- Vollständige Perioden-Konfiguration für den Wizard.
    -- Wenn null: Client verwendet Fallback-Defaults (voller Standardkatalog).
    'period',      v_period
  );
end;
$$;

grant execute on function clar_log.resolve_teen_token(text) to anon, authenticated;

-- ─── get_teen_log: bestehenden Tages-Eintrag laden (für Resume) ───────────
create or replace function clar_log.get_teen_log(
  input_token text,
  input_date  text
)
returns jsonb
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_token record;
  v_data  jsonb;
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token
    and active = true
    and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  select data into v_data
  from clar_log.teen_logs
  where teen_token_id = v_token.id
    and date = input_date
  limit 1;

  return v_data;
end;
$$;

grant execute on function clar_log.get_teen_log(text, text) to anon, authenticated;

-- ─── get_teen_logs_by_doctor_token: für die Arzt-Ansicht ─────────────────────
-- Der Arzt hat kein Login, nur einen 90-Tage-Token (doctor_links). Damit die
-- Dossier-Ansicht Teen-Einträge zeigen kann, brauchen wir einen SECURITY-DEFINER
-- Reader, der die Teen-Logs der Perioden-Zeit ausgibt, aber ausschliesslich
-- für die (owner_id, period_id), auf die der Doctor-Token verweist.
create or replace function clar_log.get_teen_logs_by_doctor_token(input_token text)
returns table (
  teen_name text,
  date      text,
  data      jsonb
)
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_link record;
begin
  select owner_id, period_id
    into v_link
  from clar_log.doctor_links
  where token = input_token
    and active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return;
  end if;

  return query
  select tl.teen_name, tl.date, tl.data
  from clar_log.teen_logs tl
  where tl.owner_id = v_link.owner_id
    and tl.period_id = v_link.period_id::text
  order by tl.date desc;
end;
$$;

grant execute on function clar_log.get_teen_logs_by_doctor_token(text) to anon, authenticated;
