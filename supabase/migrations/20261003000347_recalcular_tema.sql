-- One place that keeps a topic honest: its centroid is the normalized mean of its non-excluded claims with a vector,
-- and a topic left with no claims goes away together with the names that were merged into it.
create function public.recalcular_tema(p_tema uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.afirmaciones where tema_id = p_tema and not excluida) then
    update public.temas
       set centroide = coalesce(
             (select extensions.l2_normalize(extensions.avg(a.vector)) from public.afirmaciones a
               where a.tema_id = p_tema and not a.excluida and a.vector is not null),
             centroide),
           actualizado_en = now()
     where id = p_tema;
  elsif not exists (select 1 from public.afirmaciones where tema_id = p_tema) then
    delete from public.temas where fusionado_en = p_tema;
    delete from public.temas where id = p_tema;
  end if;
end $$;

revoke execute on function public.recalcular_tema(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_tema(uuid) to service_role;

-- Whatever deletes claims (a reprocessed or deleted material) leaves its topics consistent.
create function public.recalcular_temas_de_borradas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tema uuid;
begin
  for tema in select distinct tema_id from viejas where tema_id is not null loop
    perform public.recalcular_tema(tema);
  end loop;
  return null;
end $$;

revoke execute on function public.recalcular_temas_de_borradas() from public, anon, authenticated;

create trigger recalcular_temas after delete on public.afirmaciones
  referencing old table as viejas
  for each statement execute function public.recalcular_temas_de_borradas();

create or replace function public.excluir_afirmacion(p_id uuid, p_excluida boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tema_anterior uuid;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  select tema_id into tema_anterior from public.afirmaciones where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'afirmacion_inexistente';
  end if;
  -- Excluding detaches the claim, and its old topic gets a fresh centroid or goes away if it was the last claim.
  update public.afirmaciones
     set excluida = p_excluida, tema_id = case when p_excluida then null else tema_id end
   where id = p_id;
  if p_excluida and tema_anterior is not null then
    perform public.recalcular_tema(tema_anterior);
  end if;
end $$;

-- Same behavior as before, with the topic loop replaced by recalcular_tema.
create or replace function public.reprocesar_material(p_id uuid) returns void
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

  -- The delete trigger already recalculates these; the explicit pass keeps the contract visible and is idempotent.
  foreach tema in array afectados loop
    perform public.recalcular_tema(tema);
  end loop;

  if rol_actual <> 'estrategia' then
    delete from public.fichas where material_id = p_id;
  end if;
end $$;
