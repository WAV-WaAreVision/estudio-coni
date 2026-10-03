-- When Trigger.dev could not be started for a material, it would sit procesando with no reason: polled forever and
-- not retryable. Giving it a reason stops the polling and makes reintentar_material accept it.
create function public.marcar_disparo_fallido(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set motivo_fallo = 'No pude iniciar el procesamiento. Reintenta.'
   where id = p_id and estado = 'procesando' and motivo_fallo is null;
end;
$$;

revoke execute on function public.marcar_disparo_fallido(uuid) from public, anon;
grant execute on function public.marcar_disparo_fallido(uuid) to authenticated;
