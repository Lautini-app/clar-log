-- clar.log — Wortbericht (P7)
-- Einmalig im Supabase SQL-Editor ausführen (Projekt cgwpzpnklxphqxlixtva, Schema clar_log).

create table if not exists clar_log.word_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  content text not null,
  range_days integer not null,
  sent_to_doctor_at timestamptz,
  created_at timestamptz not null default now()
);

grant usage on schema clar_log to anon, authenticated, service_role;
grant select, insert, update, delete on clar_log.word_reports to authenticated;
grant all on clar_log.word_reports to service_role;

alter table clar_log.word_reports enable row level security;

drop policy if exists "own word reports" on clar_log.word_reports;
create policy "own word reports" on clar_log.word_reports
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
