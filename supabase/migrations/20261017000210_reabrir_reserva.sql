-- Spec 2026-10-17, decision 12 (amendment A2 of its plan): a voice attempt whose reservation was released (ElevenLabs
-- refused it) is tried again under the same key. Only a release proven not charged (sin_cobro) reopens: the sweeper
-- also releases voice keys, after an unknown outcome that may have been billed, and those stay closed. Opt-in: the
-- script writer reads a released Claude key as "Claude refused, do not ask again" (lib/produccion/producir.ts) and must
-- keep getting it back as it is.
-- Who opened the reservation: the caller passes a token of its own and owns the reservation only when the row comes
-- back with it. Read under the month's lock, so two runs racing for one key cannot both believe they hold it.
alter table public.gastos add column reservado_por uuid;
comment on column public.gastos.reservado_por is
  'Token of the call that inserted or reopened this reservation (reservar_gasto p_reservado_por); null for older rows.';

drop function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz);

create function public.reservar_gasto(
  p_pieza uuid,
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now(),
  p_reabrir boolean default false,
  p_reservado_por uuid default null
) returns public.gastos
language plpgsql set search_path = '' as $$
declare
  v_mes date := date_trunc('month', p_ahora at time zone 'America/Santiago')::date;
  v_existente public.gastos;
  v_tope numeric;
  v_usado numeric;
  v_nuevo public.gastos;
begin
  -- One reservation at a time per month, so two renders started together cannot both pass the cap.
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));

  select * into v_existente from public.gastos where clave = p_clave;
  if found and not (p_reabrir and v_existente.estado = 'liberado' and v_existente.sin_cobro) then
    return v_existente;
  end if;

  select tope_mensual_usd into v_tope from public.ajustes where id;
  -- Without a cap row the comparison below would be null and spend would pass unchecked.
  if v_tope is null then
    raise exception using errcode = 'P0001', message = 'ajustes_faltantes';
  end if;
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if v_usado + p_estimado > v_tope then
    raise exception using errcode = 'P0001', message = 'tope_alcanzado',
      detail = format('usado=%s estimado=%s tope=%s', v_usado, p_estimado, v_tope);
  end if;

  if v_existente.id is not null then
    -- Reopened: counted again in this month, with a fresh clock for the sweeper and no proof of "not charged".
    update public.gastos
       set estado = 'reservado', estimado_usd = p_estimado, real_usd = null, mes = v_mes,
           creado_en = now(), sin_cobro = false, reservado_por = p_reservado_por
     where id = v_existente.id
    returning * into v_nuevo;
  else
    insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave, reservado_por)
    values (p_pieza, p_proveedor, p_paso, v_mes, p_estimado, p_clave, p_reservado_por)
    returning * into v_nuevo;
  end if;
  return v_nuevo;
end $$;

revoke execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid)
  to service_role;
