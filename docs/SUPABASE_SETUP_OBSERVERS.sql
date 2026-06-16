-- clar.log — Beobachter-System (P5)
-- Einmalig im Supabase SQL-Editor ausführen (Projekt cgwpzpnklxphqxlixtva, Schema clar_log).
-- Setzt voraus: clar_log.observation_periods und clar_log.daily_logs existieren bereits.

create table if not exists clar_log.observers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  observer_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('parent', 'teacher', 'other')),
  name text,
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);

create table if not exists clar_log.teacher_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists clar_log.observer_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  date date not null,
  observer_user_id uuid references auth.users(id) on delete cascade,
  observer_name text,
  mood smallint,
  behavior smallint,
  concentration smallint,
  note text,
  created_at timestamptz not null default now(),
  unique (owner_id, observer_user_id, date)
);

grant usage on schema clar_log to anon, authenticated, service_role;
grant select, insert, update, delete on clar_log.observers to authenticated;
grant select, insert, update, delete on clar_log.teacher_links to authenticated;
grant select, insert, update, delete on clar_log.observer_observations to authenticated;
grant all on clar_log.observers, clar_log.teacher_links, clar_log.observer_observations to service_role;

alter table clar_log.observers enable row level security;
alter table clar_log.teacher_links enable row level security;
alter table clar_log.observer_observations enable row level security;

-- Owner verwaltet seine eigenen Beobachter-Einladungen.
drop policy if exists "owner manages observers" on clar_log.observers;
create policy "owner manages observers" on clar_log.observers
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Ein eingeladener Beobachter darf seine eigene (bereits angenommene) Zeile sehen.
drop policy if exists "observer sees own link" on clar_log.observers;
create policy "observer sees own link" on clar_log.observers
  for select to authenticated
  using (auth.uid() = observer_user_id);

-- Owner verwaltet eigene Lehrperson-Links (Erzeugen/Rotieren/Deaktivieren).
drop policy if exists "owner manages teacher links" on clar_log.teacher_links;
create policy "owner manages teacher links" on clar_log.teacher_links
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Beobachtungen: Owner sieht alle zu seinen Perioden, aktive Beobachter sehen/schreiben ihre eigenen.
drop policy if exists "owner reads observations" on clar_log.observer_observations;
create policy "owner reads observations" on clar_log.observer_observations
  for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "observer manages own observation" on clar_log.observer_observations;
create policy "observer manages own observation" on clar_log.observer_observations
  for all to authenticated
  using (
    auth.uid() = observer_user_id
    and exists (
      select 1 from clar_log.observers o
      where o.owner_id = observer_observations.owner_id
        and o.observer_user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = observer_user_id
    and exists (
      select 1 from clar_log.observers o
      where o.owner_id = observer_observations.owner_id
        and o.observer_user_id = auth.uid()
    )
  );

-- Aktive Beobachter dürfen die Tagesdaten des Owners lesen (für den Perspektivenvergleich im Bericht).
drop policy if exists "observers read owner daily logs" on clar_log.daily_logs;
create policy "observers read owner daily logs" on clar_log.daily_logs
  for select to authenticated
  using (
    exists (
      select 1 from clar_log.observers o
      where o.owner_id = daily_logs.user_id
        and o.observer_user_id = auth.uid()
    )
  );

-- Einladung annehmen: verknüpft die Zeile mit dem eingeloggten Beobachter per E-Mail-Match.
create or replace function clar_log.accept_observer_invite(invite_email text)
returns void
language sql
security definer
set search_path = clar_log
as $$
  update clar_log.observers
  set observer_user_id = auth.uid()
  where email = invite_email
    and observer_user_id is null;
$$;
grant execute on function clar_log.accept_observer_invite(text) to authenticated;

-- Token-Auflösung für die öffentliche Lehrperson-Seite (kein Login).
create or replace function clar_log.resolve_teacher_token(input_token text)
returns table (owner_id uuid, period_id uuid)
language sql
security definer
set search_path = clar_log
as $$
  select owner_id, period_id
  from clar_log.teacher_links
  where token = input_token
    and active = true
    and expires_at > now();
$$;
grant execute on function clar_log.resolve_teacher_token(text) to anon, authenticated;

-- Token-gesichertes Einreichen des abendlichen Kurzformulars (kein Login, kein direkter Tabellenzugriff für anon).
create or replace function clar_log.submit_teacher_observation(
  input_token text,
  input_date date,
  input_mood smallint,
  input_behavior smallint,
  input_concentration smallint,
  input_note text
)
returns void
language plpgsql
security definer
set search_path = clar_log
as $$
declare
  link clar_log.teacher_links;
begin
  select * into link from clar_log.teacher_links
    where token = input_token and active = true and expires_at > now();
  if link.id is null then
    raise exception 'invalid or expired token';
  end if;

  insert into clar_log.observer_observations
    (owner_id, period_id, date, observer_name, mood, behavior, concentration, note)
  values
    (link.owner_id, link.period_id, input_date, 'Lehrperson', input_mood, input_behavior, input_concentration, input_note)
  on conflict (owner_id, observer_user_id, date) do nothing;
end;
$$;
grant execute on function clar_log.submit_teacher_observation(text, date, smallint, smallint, smallint, text) to anon, authenticated;
