-- clar.tracker — Schema-Setup für externes Supabase-Projekt
-- Projekt: cgwpzpnklxphqxlixtva (geteilt mit clar.heim / clar.markt)
-- Einmalig im Supabase SQL-Editor ausführen.
-- Danach: Dashboard → Settings → API → "Exposed schemas" → `clar_log` ergänzen.

create schema if not exists clar_log;

create table if not exists clar_log.tracker_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists clar_log.tracker_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

grant usage on schema clar_log to anon, authenticated, service_role;
grant select, insert, update, delete on clar_log.tracker_logs to authenticated;
grant select, insert, update, delete on clar_log.tracker_settings to authenticated;
grant all on clar_log.tracker_logs to service_role;
grant all on clar_log.tracker_settings to service_role;

alter table clar_log.tracker_logs enable row level security;
alter table clar_log.tracker_settings enable row level security;

drop policy if exists "own logs" on clar_log.tracker_logs;
create policy "own logs" on clar_log.tracker_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own settings" on clar_log.tracker_settings;
create policy "own settings" on clar_log.tracker_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
