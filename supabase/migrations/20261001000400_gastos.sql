create function public.reservar_gasto(
  p_pieza uuid,
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now()
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
  if found then
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

  insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave)
  values (p_pieza, p_proveedor, p_paso, v_mes, p_estimado, p_clave)
  returning * into v_nuevo;
  return v_nuevo;
end $$;

create function public.confirmar_gasto(p_clave text, p_real numeric) returns public.gastos
language sql set search_path = '' as $$
  update public.gastos set estado = 'confirmado', real_usd = p_real
  where clave = p_clave and estado = 'reservado'
  returning *
$$;

create function public.liberar_gasto(p_clave text) returns public.gastos
language sql set search_path = '' as $$
  update public.gastos set estado = 'liberado'
  where clave = p_clave and estado = 'reservado'
  returning *
$$;

revoke execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz),
  public.confirmar_gasto(text, numeric), public.liberar_gasto(text) from public, anon, authenticated;
grant execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz),
  public.confirmar_gasto(text, numeric), public.liberar_gasto(text) to service_role;
