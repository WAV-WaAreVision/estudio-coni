-- Issue 117: a confirmation after a failed start kept the failed-start reason, so the material read «En pausa» while
-- its new run was processing and offered «Reintentar», which started a second run. The confirmation starts a fresh
-- run, so it clears any reason left on the row. Same as 20261109000100 otherwise.
create or replace function public.poner_material_en_cola(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set en_cola_desde = now(),
         motivo_fallo = null
   where id = p_id
     and subido_por = auth.uid()
     and estado = 'procesando'
     and borrar_desde is null;
  get diagnostics actualizado = row_count;
  return actualizado > 0;
end;
$$;

revoke execute on function public.poner_material_en_cola(uuid) from public, anon;
grant execute on function public.poner_material_en_cola(uuid) to authenticated;
