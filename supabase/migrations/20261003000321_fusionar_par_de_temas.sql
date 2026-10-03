-- One merge in one transaction: no crash can leave claims moved and the loser still active.
-- The winner's centroid is the L2-normalized mean of its non-excluded claims, as the application computes it.
create function public.fusionar_par_de_temas(p_ganador uuid, p_perdedor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ganador public.temas;
  perdedor public.temas;
begin
  if p_ganador is not distinct from p_perdedor then
    raise exception using errcode = '22023', message = 'temas_iguales';
  end if;
  select * into ganador from public.temas where id = least(p_ganador, p_perdedor) for update;
  select * into perdedor from public.temas where id = greatest(p_ganador, p_perdedor) for update;
  if ganador.id is distinct from p_ganador then
    -- The locks were taken in id order; swap the rows back to their roles.
    select * into perdedor from public.temas where id = p_perdedor;
    select * into ganador from public.temas where id = p_ganador;
  end if;
  if ganador.id is null or perdedor.id is null then
    raise exception using errcode = 'P0002', message = 'tema_inexistente';
  end if;
  if ganador.fusionado_en is not null or perdedor.fusionado_en is not null then
    raise exception using errcode = '22023', message = 'tema_ya_fusionado';
  end if;

  update public.afirmaciones set tema_id = p_ganador where tema_id = p_perdedor;
  update public.temas set fusionado_en = p_ganador where fusionado_en = p_perdedor;
  update public.temas set fusionado_en = p_ganador, actualizado_en = now() where id = p_perdedor;
  update public.temas
  set alias = ganador.alias || coalesce((
        select array_agg(c.nombre_alias order by c.ord)
        from (
          select distinct on (public.unaccent_inmutable(lower(btrim(x.nombre_alias)))) x.nombre_alias, x.ord
          from unnest(array[perdedor.nombre] || perdedor.alias) with ordinality as x(nombre_alias, ord)
          where public.unaccent_inmutable(lower(btrim(x.nombre_alias))) <> ganador.nombre_normalizado
            and not exists (
              select 1 from unnest(ganador.alias) d
              where public.unaccent_inmutable(lower(btrim(d))) = public.unaccent_inmutable(lower(btrim(x.nombre_alias)))
            )
          order by public.unaccent_inmutable(lower(btrim(x.nombre_alias))), x.ord
        ) c
      ), '{}'),
      centroide = coalesce((
        select extensions.l2_normalize(extensions.avg(a.vector))
        from public.afirmaciones a
        where a.tema_id = p_ganador and not a.excluida and a.vector is not null
      ), ganador.centroide),
      actualizado_en = now()
  where id = p_ganador;
end $$;

revoke execute on function public.fusionar_par_de_temas(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fusionar_par_de_temas(uuid, uuid) to service_role;
