-- clar.log — Teen-Flow: RLS-Policies und RPCs
-- Einmalig im Supabase SQL-Editor ausführen.
-- Voraussetzung: SUPABASE_SETUP.sql und SUPABASE_SETUP_FAMILY.sql wurden ausgeführt.

-- ─── RLS: Admin kann Logs seines Teens lesen ─────────────────────────────────

drop policy if exists "family admin read logs" on clar_log.tracker_logs;
create policy "family admin read logs" on clar_log.tracker_logs
  for select to authenticated
  using (
    exists (
      select 1 from clar_log.family_members
      where admin_user_id = auth.uid()
        and member_user_id = clar_log.tracker_logs.user_id
        and status = 'active'
    )
  );

-- ─── RLS: Admin kann Settings seines Teens lesen ─────────────────────────────

drop policy if exists "family admin read settings" on clar_log.tracker_settings;
create policy "family admin read settings" on clar_log.tracker_settings
  for select to authenticated
  using (
    exists (
      select 1 from clar_log.family_members
      where admin_user_id = auth.uid()
        and member_user_id = clar_log.tracker_settings.user_id
        and status = 'active'
    )
  );

-- ─── RPC: Teen liest aktuelle Medikamente des Admins (SECURITY DEFINER) ──────

create or replace function clar_log.get_admin_meds_for_teen()
returns jsonb
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_teen_id    uuid;
  v_admin_id   uuid;
  v_admin_data jsonb;
  v_active_pid text;
  v_period     jsonb;
begin
  v_teen_id := auth.uid();
  if v_teen_id is null then raise exception 'Not authenticated'; end if;

  select admin_user_id into v_admin_id
  from clar_log.family_members
  where member_user_id = v_teen_id and status = 'active'
  limit 1;

  if v_admin_id is null then return '[]'::jsonb; end if;

  select data into v_admin_data
  from clar_log.tracker_settings
  where user_id = v_admin_id;

  if v_admin_data is null then return '[]'::jsonb; end if;

  v_active_pid := v_admin_data->>'activePeriodId';

  if v_active_pid is not null then
    select elem into v_period
    from jsonb_array_elements(coalesce(v_admin_data->'periods', '[]'::jsonb)) elem
    where elem->>'id' = v_active_pid
    limit 1;
  end if;

  if v_period is null then
    select elem into v_period
    from jsonb_array_elements(coalesce(v_admin_data->'periods', '[]'::jsonb)) elem
    limit 1;
  end if;

  if v_period is null then return '[]'::jsonb; end if;

  return coalesce(v_period->'medications', '[]'::jsonb);
end;
$$;

grant execute on function clar_log.get_admin_meds_for_teen() to authenticated;
