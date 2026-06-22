create or replace function clar_log.resolve_teen_token(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = clar_log, public
as $$
declare
  v_token    record;
  v_settings jsonb;
  v_period   jsonb;
  v_meds     jsonb := '[]'::jsonb;
  v_pname    text  := '';
begin
  select * into v_token
  from clar_log.teen_tokens
  where token = input_token and active = true and expires_at > now()
  limit 1;

  if not found then return null; end if;

  -- Medikamente aus tracker_settings laden
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
