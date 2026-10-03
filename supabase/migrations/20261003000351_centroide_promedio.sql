-- `temas.centroide` is the PLAIN mean of the vectors of the topic's non-excluded claims, NOT normalized.
-- For unit vectors, `v · centroide` is then the mean cosine between a claim and the topic's members (average
-- linkage). A normalized centroid made big random groups attractors: it sits ~0.81 from every member while the
-- members are only ~0.66 from each other. `fusionar_par_de_temas` and `recalcular_tema` (which `reprocesar_material`,
-- `excluir_afirmacion` and the delete trigger call) keep this invariant; the application's incremental update is
-- (m*n + v)/(n+1).
-- Redefined: `fusionar_par_de_temas` takes the winner's centroid as the plain mean of its claims.
create or replace function public.fusionar_par_de_temas(p_ganador uuid, p_perdedor uuid) returns void
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
        select extensions.avg(a.vector)
        from public.afirmaciones a
        where a.tema_id = p_ganador and not a.excluida and a.vector is not null
      ), ganador.centroide),
      actualizado_en = now()
  where id = p_ganador;
end $$;

-- Redefined: the centroid is the plain mean, not its normalization.
create or replace function public.recalcular_tema(p_tema uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.afirmaciones where tema_id = p_tema and not excluida) then
    update public.temas
       set centroide = coalesce(
             (select extensions.avg(a.vector) from public.afirmaciones a
               where a.tema_id = p_tema and not a.excluida and a.vector is not null),
             centroide),
           actualizado_en = now()
     where id = p_tema;
  elsif not exists (select 1 from public.afirmaciones where tema_id = p_tema) then
    delete from public.temas where fusionado_en = p_tema;
    delete from public.temas where id = p_tema;
  end if;
end $$;

-- Existing topics held normalized centroids: bring them to the plain mean.
update public.temas t
   set centroide = m.media
  from (
    select a.tema_id, extensions.avg(a.vector) as media
      from public.afirmaciones a
     where a.tema_id is not null and not a.excluida and a.vector is not null
     group by a.tema_id
  ) m
 where t.id = m.tema_id and t.fusionado_en is null;
