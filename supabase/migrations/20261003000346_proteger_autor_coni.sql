create or replace function public.fusionar_autores(p_origen uuid, p_destino uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  origen public.autores;
  destino public.autores;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if exists (select 1 from public.autores where id = p_origen and tipo = 'coni') then
    raise exception using errcode = '22023', message = 'autor_coni_protegido';
  end if;
  if p_origen is not distinct from p_destino then
    raise exception using errcode = '22023', message = 'autores_iguales';
  end if;
  select * into origen from public.autores where id = p_origen for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'autor_inexistente';
  end if;
  select * into destino from public.autores where id = p_destino for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'autor_inexistente';
  end if;
  update public.materiales set autor_id = p_destino where autor_id = p_origen;
  update public.afirmaciones set autor_id = p_destino where autor_id = p_origen;
  update public.autores
  set alias = destino.alias || coalesce((
    select array_agg(nombre_alias order by ord)
    from (
      select distinct on (public.unaccent_inmutable(lower(btrim(c.nombre_alias)))) c.nombre_alias, c.ord
      from unnest(array[origen.nombre] || origen.alias) with ordinality as c(nombre_alias, ord)
      where public.unaccent_inmutable(lower(btrim(c.nombre_alias))) <> destino.nombre_normalizado
        and not exists (
          select 1 from unnest(destino.alias) d
          where public.unaccent_inmutable(lower(btrim(d))) = public.unaccent_inmutable(lower(btrim(c.nombre_alias)))
        )
      order by public.unaccent_inmutable(lower(btrim(c.nombre_alias))), c.ord
    ) unicos
  ), '{}')
  where id = p_destino;
  delete from public.autores where id = p_origen;
end $$;

revoke execute on function public.fusionar_autores(uuid, uuid) from public, anon;
grant execute on function public.fusionar_autores(uuid, uuid) to authenticated;
