-- Members cannot update materiales.estado directly, so retrying goes through this RPC.
-- Retryable: a failed material, or one the monthly cap stopped (procesando with a reason).
create function public.reintentar_material(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set estado = 'procesando', motivo_fallo = null
   where id = p_id
     and (estado = 'fallido' or (estado = 'procesando' and motivo_fallo is not null));
  get diagnostics actualizado = row_count;
  if actualizado = 0 then
    raise exception using errcode = '22023', message = 'no_reintentable';
  end if;
end;
$$;

revoke execute on function public.reintentar_material(uuid) from public, anon;
grant execute on function public.reintentar_material(uuid) to authenticated;
