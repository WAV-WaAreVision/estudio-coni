-- A long material waits for a person to confirm what processing it will cost. The service role writes the estimate
-- (members have no column grants on either column); the member only confirms, through the RPC below.
alter table public.materiales
  add column costo_estimado_usd numeric,
  add column costo_confirmado_en timestamptz;

create function public.confirmar_costo_material(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set costo_confirmado_en = now(), motivo_fallo = null
   where id = p_id
     and estado = 'procesando'
     and costo_estimado_usd is not null
     and costo_confirmado_en is null;
  get diagnostics actualizado = row_count;
  if actualizado = 0 then
    raise exception using errcode = '22023', message = 'no_confirmable';
  end if;
end;
$$;

revoke execute on function public.confirmar_costo_material(uuid) from public, anon;
grant execute on function public.confirmar_costo_material(uuid) to authenticated;
