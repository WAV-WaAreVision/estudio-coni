-- Members cannot update materiales.estado directly, so reprocessing a ready material goes through this RPC.
-- It sends the material back to processing with the cost gate closed again (the new role or a long text may cost
-- something else), drops what the old run derived (its claims, and its card unless the role is still estrategia),
-- and leaves the topics consistent: the ones left empty go away, the ones that keep other materials' claims get a
-- fresh centroid. The stored extraction and the claim checkpoints stay in the store, so the new run reuses them.
create function public.reprocesar_material(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
  tema uuid;
  afectados uuid[];
  rol_actual text;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set estado = 'procesando', motivo_fallo = null, costo_estimado_usd = null, costo_confirmado_en = null
   where id = p_id and estado = 'listo'
  returning rol into rol_actual;
  get diagnostics actualizado = row_count;
  if actualizado = 0 then
    raise exception using errcode = '22023', message = 'no_reprocesable';
  end if;

  select coalesce(array_agg(distinct tema_id), '{}') into afectados
    from public.afirmaciones where material_id = p_id and tema_id is not null;
  delete from public.afirmaciones where material_id = p_id;

  foreach tema in array afectados loop
    if exists (select 1 from public.afirmaciones where tema_id = tema and not excluida) then
      update public.temas
         set centroide = coalesce(
               (select extensions.l2_normalize(extensions.avg(a.vector)) from public.afirmaciones a
                 where a.tema_id = tema and not a.excluida and a.vector is not null),
               centroide),
             actualizado_en = now()
       where id = tema;
    elsif not exists (select 1 from public.afirmaciones where tema_id = tema) then
      delete from public.temas where fusionado_en = tema;
      delete from public.temas where id = tema;
    end if;
  end loop;

  if rol_actual <> 'estrategia' then
    delete from public.fichas where material_id = p_id;
  end if;
end;
$$;

revoke execute on function public.reprocesar_material(uuid) from public, anon;
grant execute on function public.reprocesar_material(uuid) to authenticated;
