-- clar.log — Teen Token-Links (kein Konto, kein Login)
-- Einmalig im Supabase SQL-Editor ausführen.
-- Voraussetzung: SUPABASE_SETUP.sql wurde ausgeführt.

-- ─── Tabelle: teen_tokens ────────────────────────────────────────────────────

create table if not exists clar_log.teen_tokens (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  period_id  text not null,
  token      text not null unique,
  name       text not null,
  active     boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists teen_tokens_owner_idx on clar_log.teen_tokens(owner_id);
create index if not exists teen_tokens_token_idx on clar_log.teen_tokens(token);

-- RLS
alter table clar_log.teen_tokens enable row level security;

drop policy if exists "owner manages teen tokens" on clar_log.teen_tokens;
create policy "owner manages teen tokens" on clar_log.teen_tokens
  for all to authenticated
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Anon darf lesen (für resolve_teen_token)
drop policy if exists "anon reads active teen tokens" on clar_log.teen_tokens;
create policy "anon reads active teen tokens" on clar_log.teen_tokens
  for select to anon, authenticated
  using (active = true and expires_at > now());

-- ─── Tabelle: teen_logs ──────────────────────────────────────────────────────
-- Speichert die täglichen Einträge der Jugendlichen.
-- Unter owner_id (Admin) gespeichert → erscheint im Admin-Verlauf.

create table if not exists clar_log.teen_logs (
  id             uuid primary key default gen_random_uuid(),
  teen_token_id  uuid not null references clar_log.teen_tokens(id) on delete cascade,
  owner_id       uuid not null,
  period_id      text not null,
  teen_name      text not null,
  date           text not null,
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(teen_token_id, date)
);

create index if not exists teen_logs_owner_idx on clar_log.teen_logs(owner_id, date);

alter table clar_log.teen_logs enable row level security;

-- Admin kann seine Teen-Logs lesen
drop policy if exists "owner reads teen logs" on clar_log.teen_logs;
create policy "owner reads teen logs" on clar_log.teen_logs
  for select to authenticated
  using (owner_id = auth.uid());

-- ─── RPC: resolve_teen_token ─────────────────────────────────────────────────
-- Öffentlich (anon + authenticated).
-- Gibt owner_id, period_id, name, period_name und medications zurück.

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
  v_meds     jsonb := '[]'::jsonb;
  v_pname    text  := '';
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token and active = true and expires_at > now()
  limit 1;

  if not found then return null; end if;

  -- Medikamente aus observation_periods laden
  select data into v_period
  from clar_log.observation_periods
  where user_id = v_token.owner_id and id = v_token.period_id
  limit 1;

  -- Fallback: tracker_settings
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

  if v_period is not null then
    v_meds  := coalesce(v_period->'medications', '[]'::jsonb);
    v_pname := coalesce(v_period->>'name', '');
  end if;

  return jsonb_build_object(
    'owner_id',    v_token.owner_id::text,
    'period_id',   v_token.period_id,
    'name',        v_token.name,
    'period_name', v_pname,
    'medications', v_meds
  );
end;
$$;

grant execute on function clar_log.resolve_teen_token(text) to anon, authenticated;

-- ─── RPC: submit_teen_log ────────────────────────────────────────────────────
-- Speichert einen täglichen Eintrag für den Teen.
-- Upsert auf (teen_token_id, date).

create or replace function clar_log.submit_teen_log(
  input_token text,
  input_date  text,
  input_data  jsonb
)
returns void
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_token record;
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token and active = true and expires_at > now()
  limit 1;

  if not found then raise exception 'Invalid or expired token'; end if;

  insert into clar_log.teen_logs (teen_token_id, owner_id, period_id, teen_name, date, data, updated_at)
  values (v_token.id, v_token.owner_id, v_token.period_id, v_token.name, input_date, input_data, now())
  on conflict (teen_token_id, date)
  do update set data = excluded.data, updated_at = now();
end;
$$;

grant execute on function clar_log.submit_teen_log(text, text, jsonb) to anon, authenticated;
