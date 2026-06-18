-- clar.log — Family Invite + Members Setup
-- Einmalig (idempotent) im Supabase SQL-Editor ausführen.

-- ─── Tables ────────────────────────────────────────────────────────────────

create table if not exists clar_log.family_invites (
  id            uuid        primary key default gen_random_uuid(),
  admin_user_id uuid        not null references auth.users(id) on delete cascade,
  email         text        not null,
  name          text,
  role          text        not null default 'member', -- 'member' | 'teen'
  token         text        not null unique,
  status        text        not null default 'pending', -- 'pending' | 'accepted' | 'expired'
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create table if not exists clar_log.family_members (
  id             uuid        primary key default gen_random_uuid(),
  admin_user_id  uuid        not null references auth.users(id) on delete cascade,
  member_user_id uuid        not null references auth.users(id) on delete cascade,
  role           text        not null default 'member',
  name           text,
  status         text        not null default 'active',
  created_at     timestamptz not null default now(),
  unique (admin_user_id, member_user_id)
);

-- ─── Grants ────────────────────────────────────────────────────────────────

grant usage  on schema clar_log                    to authenticated;
grant select, insert, update on clar_log.family_invites  to authenticated;
grant select, insert, update on clar_log.family_members  to authenticated;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table clar_log.family_invites enable row level security;
alter table clar_log.family_members enable row level security;

drop policy if exists "admin manages own invites" on clar_log.family_invites;
create policy "admin manages own invites" on clar_log.family_invites
  for all to authenticated
  using  (auth.uid() = admin_user_id)
  with check (auth.uid() = admin_user_id);

drop policy if exists "family member access" on clar_log.family_members;
create policy "family member access" on clar_log.family_members
  for all to authenticated
  using  (auth.uid() = admin_user_id or auth.uid() = member_user_id)
  with check (auth.uid() = admin_user_id);

-- ─── RPC: accept_family_invite_token ───────────────────────────────────────

create or replace function clar_log.accept_family_invite_token(
  input_token   text,
  input_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_invite record;
begin
  if auth.uid() != input_user_id then
    raise exception 'Unauthorised';
  end if;

  select * into v_invite
  from clar_log.family_invites
  where token = input_token
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'Einladung nicht gefunden, bereits verwendet oder abgelaufen';
  end if;

  update clar_log.family_invites
     set status = 'accepted'
   where id = v_invite.id;

  insert into clar_log.family_members (admin_user_id, member_user_id, role, name)
  values (v_invite.admin_user_id, input_user_id, v_invite.role, v_invite.name)
  on conflict (admin_user_id, member_user_id) do update
    set status = 'active',
        role   = excluded.role;
end;
$$;

grant execute on function clar_log.accept_family_invite_token(text, uuid) to authenticated;

-- ─── RPC: setup_teen_settings ──────────────────────────────────────────────
-- Legt tracker_settings mit teen_self-Periode an, kopiert Medikamente vom Admin.
-- SECURITY DEFINER damit die Admin-Settings trotz RLS gelesen werden können.

create or replace function clar_log.setup_teen_settings(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_teen_id          uuid;
  v_admin_id         uuid;
  v_admin_data       jsonb;
  v_active_pid       text;
  v_admin_period     jsonb;
  v_new_period_id    text;
  v_new_period       jsonb;
  v_new_settings     jsonb;
  v_existing_count   int;
begin
  v_teen_id := auth.uid();
  if v_teen_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Admin via Invite-Token ermitteln (status egal – Einladung kann schon 'accepted' sein)
  select admin_user_id into v_admin_id
  from clar_log.family_invites
  where token = input_token
    and expires_at > now()
  limit 1;

  if v_admin_id is null then
    raise exception 'Einladung nicht gefunden oder abgelaufen';
  end if;

  -- Abbrechen wenn Teen bereits Perioden hat
  select coalesce(jsonb_array_length(data->'periods'), 0)
    into v_existing_count
    from clar_log.tracker_settings
   where user_id = v_teen_id;

  if coalesce(v_existing_count, 0) > 0 then
    return jsonb_build_object('ok', true, 'action', 'already_exists');
  end if;

  -- Admin-Settings laden (SECURITY DEFINER übergeht die "own settings"-RLS-Policy)
  select data into v_admin_data
  from clar_log.tracker_settings
  where user_id = v_admin_id;

  -- Aktive Periode des Admins finden
  if v_admin_data is not null then
    v_active_pid := v_admin_data->>'activePeriodId';
    if v_active_pid is not null then
      select elem into v_admin_period
      from jsonb_array_elements(coalesce(v_admin_data->'periods', '[]'::jsonb)) elem
      where elem->>'id' = v_active_pid
      limit 1;
    end if;
    if v_admin_period is null then
      select elem into v_admin_period
      from jsonb_array_elements(coalesce(v_admin_data->'periods', '[]'::jsonb)) elem
      limit 1;
    end if;
  end if;

  v_new_period_id := gen_random_uuid()::text;

  if v_admin_period is not null then
    -- Admin-Periode kopieren (Medikamente, Einnahmezeiten, …), Identitätsfelder überschreiben
    v_new_period := v_admin_period
      || jsonb_build_object(
           'id',        v_new_period_id,
           'profile',   'teen_self',
           'active',    true,
           'startDate', to_char((now() at time zone 'Europe/Zurich')::date, 'YYYY-MM-DD')
         );
  else
    -- Fallback: leere Standardperiode
    v_new_period := jsonb_build_object(
      'id',                   v_new_period_id,
      'profile',              'teen_self',
      'active',               true,
      'startDate',            to_char((now() at time zone 'Europe/Zurich')::date, 'YYYY-MM-DD'),
      'trackMood',            true,
      'trackSleep',           true,
      'trackMedication',      false,
      'medicationDoses',      '[]'::jsonb,
      'intakeTimes',          '[]'::jsonb,
      'customWellbeingItems', '[]'::jsonb
    );
  end if;

  v_new_settings := jsonb_build_object(
    'periods',              jsonb_build_array(v_new_period),
    'activePeriodId',       v_new_period_id,
    'customWellbeingItems', '[]'::jsonb,
    'language',             'de'
  );

  insert into clar_log.tracker_settings (user_id, data, updated_at)
  values (v_teen_id, v_new_settings, now())
  on conflict (user_id) do update
    set data       = excluded.data,
        updated_at = now()
  where jsonb_array_length(
          coalesce(clar_log.tracker_settings.data->'periods', '[]'::jsonb)
        ) = 0;

  return jsonb_build_object('ok', true, 'action', 'created', 'periodId', v_new_period_id);
end;
$$;

grant execute on function clar_log.setup_teen_settings(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSE & MANUELLER FIX für clar.markt+jugend@gmail.com
-- Im Supabase SQL-Editor ausführen um den aktuellen Stand zu prüfen.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Letzte family_members prüfen:
-- SELECT fm.*, u.email AS member_email, a.email AS admin_email
-- FROM clar_log.family_members fm
-- JOIN auth.users u ON u.id = fm.member_user_id
-- JOIN auth.users a ON a.id = fm.admin_user_id
-- ORDER BY fm.created_at DESC LIMIT 5;

-- 2. Letzte family_invites prüfen:
-- SELECT * FROM clar_log.family_invites ORDER BY created_at DESC LIMIT 5;

-- 3. Teen-Settings prüfen:
-- SELECT ts.user_id, u.email, ts.data->'activePeriodId', jsonb_array_length(ts.data->'periods')
-- FROM clar_log.tracker_settings ts
-- JOIN auth.users u ON u.id = ts.user_id
-- WHERE u.email = 'clar.markt+jugend@gmail.com';

-- 4. MANUELLER FIX: family_members + teen_self-Settings anlegen
--    (Kommentar entfernen und ausführen wenn Einträge fehlen)

/*
DO $$
DECLARE
  v_teen_id       uuid;
  v_admin_id      uuid;
  v_admin_data    jsonb;
  v_active_pid    text;
  v_admin_period  jsonb;
  v_new_pid       text;
  v_new_period    jsonb;
  v_new_settings  jsonb;
BEGIN
  SELECT id INTO v_teen_id FROM auth.users WHERE email = 'clar.markt+jugend@gmail.com';
  IF v_teen_id IS NULL THEN RAISE EXCEPTION 'Teen-User nicht gefunden'; END IF;

  SELECT admin_user_id, role INTO v_admin_id, v_active_pid  -- v_active_pid temporär für role
  FROM clar_log.family_invites
  WHERE email = 'clar.markt+jugend@gmail.com'
  ORDER BY created_at DESC LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Kein Invite für diese E-Mail gefunden'; END IF;

  -- family_members Verknüpfung sicherstellen
  INSERT INTO clar_log.family_members (admin_user_id, member_user_id, role, status)
  SELECT v_admin_id, v_teen_id,
    (SELECT role FROM clar_log.family_invites WHERE email = 'clar.markt+jugend@gmail.com' ORDER BY created_at DESC LIMIT 1),
    'active'
  ON CONFLICT (admin_user_id, member_user_id) DO UPDATE SET status = 'active';
  RAISE NOTICE 'family_members OK';

  -- Abbrechen wenn Teen schon Perioden hat
  IF EXISTS (
    SELECT 1 FROM clar_log.tracker_settings
    WHERE user_id = v_teen_id
      AND jsonb_array_length(COALESCE(data->'periods', '[]')) > 0
  ) THEN
    RAISE NOTICE 'Teen hat bereits Settings – übersprungen.';
    RETURN;
  END IF;

  -- Admin-Periode laden
  SELECT data INTO v_admin_data FROM clar_log.tracker_settings WHERE user_id = v_admin_id;
  IF v_admin_data IS NOT NULL THEN
    v_active_pid := v_admin_data->>'activePeriodId';
    SELECT elem INTO v_admin_period
    FROM jsonb_array_elements(COALESCE(v_admin_data->'periods','[]')) elem
    WHERE elem->>'id' = v_active_pid LIMIT 1;
    IF v_admin_period IS NULL THEN
      SELECT elem INTO v_admin_period
      FROM jsonb_array_elements(COALESCE(v_admin_data->'periods','[]')) elem LIMIT 1;
    END IF;
  END IF;

  v_new_pid := gen_random_uuid()::text;

  IF v_admin_period IS NOT NULL THEN
    v_new_period := v_admin_period || jsonb_build_object(
      'id', v_new_pid, 'profile', 'teen_self', 'active', true,
      'startDate', to_char(now()::date, 'YYYY-MM-DD')
    );
  ELSE
    v_new_period := jsonb_build_object(
      'id', v_new_pid, 'profile', 'teen_self', 'active', true,
      'startDate', to_char(now()::date, 'YYYY-MM-DD'),
      'trackMood', true, 'trackSleep', true, 'trackMedication', false,
      'medicationDoses', '[]'::jsonb, 'intakeTimes', '[]'::jsonb,
      'customWellbeingItems', '[]'::jsonb
    );
  END IF;

  v_new_settings := jsonb_build_object(
    'periods', jsonb_build_array(v_new_period),
    'activePeriodId', v_new_pid,
    'customWellbeingItems', '[]'::jsonb,
    'language', 'de'
  );

  INSERT INTO clar_log.tracker_settings (user_id, data, updated_at)
  VALUES (v_teen_id, v_new_settings, now())
  ON CONFLICT (user_id) DO UPDATE
    SET data = excluded.data, updated_at = now()
  WHERE jsonb_array_length(COALESCE(clar_log.tracker_settings.data->'periods','[]')) = 0;

  RAISE NOTICE 'teen_self Settings angelegt, period_id: %', v_new_pid;
END;
$$;
*/
