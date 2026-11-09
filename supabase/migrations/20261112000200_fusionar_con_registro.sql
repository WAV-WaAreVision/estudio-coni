-- Issue 22: a merge writes its undo snapshot and one row per moved claim before it changes anything, and marks its
-- fusion `aplicada`. Called without a fusion (the Trigger code deployed before this migration passes two named
-- arguments; PostgREST resolves them to this function through the default), it logs the merge as Claude's, so that
-- merge can be undone too. The effect on topics, claims and pillars is 20261104000230's. Two overloads would be
-- ambiguous for PostgREST, so the two-argument one goes.
drop function public.fusionar_par_de_temas(uuid, uuid);

create function public.fusionar_par_de_temas(p_ganador uuid, p_perdedor uuid, p_fusion uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ganador public.temas;
  perdedor public.temas;
  v_fusion public.fusiones;
  v_id uuid;
  v_agregados text[];
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

  if p_fusion is null then
    insert into public.fusiones (ganador_id, perdedor_id, origen, veredicto, modelo)
    values (p_ganador, p_perdedor, 'claude', 'mismo', public.modelo_de_huellas_vigente())
    returning id into v_id;
  else
    select * into v_fusion from public.fusiones where id = p_fusion for update;
    if v_fusion.id is null then
      raise exception using errcode = 'P0002', message = 'fusion_inexistente';
    end if;
    if v_fusion.estado <> 'propuesta' then
      raise exception using errcode = '22023', message = 'fusion_ya_decidida';
    end if;
    if v_fusion.ganador_id <> p_ganador or v_fusion.perdedor_id <> p_perdedor then
      raise exception using errcode = '22023', message = 'fusion_de_otro_par';
    end if;
    v_id := v_fusion.id;
  end if;

  v_agregados := coalesce((
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
  ), '{}');

  update public.fusiones
     set pilares_perdedor = coalesce((select jsonb_agg(to_jsonb(p) order by p.pilar_id)
                                        from public.tema_pilares p where p.tema_id = p_perdedor), '[]'::jsonb),
         pilares_ganador = coalesce((select jsonb_agg(to_jsonb(p) order by p.pilar_id)
                                       from public.tema_pilares p where p.tema_id = p_ganador), '[]'::jsonb),
         alias_agregados = v_agregados,
         encadenados = coalesce((select array_agg(t.id order by t.id) from public.temas t
                                  where t.fusionado_en = p_perdedor), '{}')
   where id = v_id;
  insert into public.fusiones_afirmaciones (fusion_id, afirmacion_id, tema_origen)
  select v_id, a.id, p_perdedor from public.afirmaciones a where a.tema_id = p_perdedor;

  update public.afirmaciones set tema_id = p_ganador where tema_id = p_perdedor;

  insert into public.tema_pilares as actual (tema_id, pilar_id, red, es_capa, fuerza, origen, lote, creado_en)
  select p_ganador, p.pilar_id, p.red, p.es_capa,
         case
           when p.fuerza = 'alta' and exists (
             select 1 from public.tema_pilares g
             where g.tema_id = p_ganador and g.red = p.red and g.fuerza = 'alta' and g.pilar_id <> p.pilar_id
           ) then 'media'
           else p.fuerza
         end,
         p.origen, p.lote, p.creado_en
  from public.tema_pilares p
  where p.tema_id = p_perdedor
  on conflict (tema_id, pilar_id) do update
    set fuerza = case
      when array_position(array['baja', 'media', 'alta'], excluded.fuerza)
         > array_position(array['baja', 'media', 'alta'], actual.fuerza) then excluded.fuerza
      else actual.fuerza
    end;
  delete from public.tema_pilares where tema_id = p_perdedor;

  update public.temas set fusionado_en = p_ganador where fusionado_en = p_perdedor;
  update public.temas set fusionado_en = p_ganador, actualizado_en = now() where id = p_perdedor;
  update public.temas
     set alias = ganador.alias || v_agregados,
         centroide = coalesce((
           select extensions.avg(a.vector)
           from public.afirmaciones a
           where a.tema_id = p_ganador and not a.excluida and a.vector is not null
         ), ganador.centroide),
         actualizado_en = now()
   where id = p_ganador;

  -- A proposal about the topic that just went away can no longer be decided as it was asked.
  update public.fusiones
     set estado = 'vencida', decidida_en = now()
   where estado = 'propuesta' and id <> v_id and p_perdedor in (ganador_id, perdedor_id);
  -- clock_timestamp: two merges in one transaction still have an order (deshacer_fusion compares them).
  -- The winner's rows as the merge leaves them: deshacer_fusion refuses when Coni changed them since.
  update public.fusiones
     set estado = 'aplicada', aplicada_en = clock_timestamp(), decidida_en = coalesce(decidida_en, now()),
         pilares_ganador_despues = coalesce((select jsonb_agg(to_jsonb(p) order by p.pilar_id)
                                               from public.tema_pilares p where p.tema_id = p_ganador), '[]'::jsonb)
   where id = v_id;
  return v_id;
end $$;

revoke execute on function public.fusionar_par_de_temas(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fusionar_par_de_temas(uuid, uuid, uuid) to service_role;
