-- Issue 22: Coni undoes a merge exactly, or not at all. Not through recalcular_tema: it deletes a topic left without
-- claims together with the topics merged into it.

-- Coni's «no» to a pair: never proposed again (temas_parecidos). Counts and model are kept for the record.
create function public.recordar_rechazo_de_coni(p_a uuid, p_b uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.temas_fusion_rechazada
    (tema_a, tema_b, origen, razon, afirmaciones_a, afirmaciones_b, modelo, rechazada_en)
  values (least(p_a, p_b), greatest(p_a, p_b), 'coni', null,
          public.afirmaciones_vivas(least(p_a, p_b)), public.afirmaciones_vivas(greatest(p_a, p_b)),
          public.modelo_de_huellas_vigente(), now())
  on conflict (tema_a, tema_b) do update
    set origen = 'coni', razon = null, afirmaciones_a = excluded.afirmaciones_a,
        afirmaciones_b = excluded.afirmaciones_b, modelo = excluded.modelo, rechazada_en = excluded.rechazada_en
$$;
revoke execute on function public.recordar_rechazo_de_coni(uuid, uuid) from public, anon, authenticated, service_role;

create function public.deshacer_fusion(p_fusion uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.fusiones;
  ganador public.temas;
  perdedor public.temas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  select * into f from public.fusiones where id = p_fusion for update;
  if f.id is null then
    raise exception using errcode = 'P0002', message = 'fusion_inexistente';
  end if;
  if f.estado <> 'aplicada' then
    raise exception using errcode = '22023', message = 'fusion_no_aplicada';
  end if;
  perform 1 from public.temas where id in (f.ganador_id, f.perdedor_id) order by id for update;
  select * into ganador from public.temas where id = f.ganador_id;
  select * into perdedor from public.temas where id = f.perdedor_id;
  -- Exact only while nothing was merged on top: the winner still active, the loser still pointing at it, and no
  -- later merge into or out of the winner (the pillar snapshot would drop that merge's rows).
  if ganador.fusionado_en is not null
     or perdedor.fusionado_en is distinct from f.ganador_id
     or exists (
       select 1 from public.fusiones g
       where g.estado = 'aplicada' and g.id <> f.id and g.aplicada_en > f.aplicada_en
         and f.ganador_id in (g.ganador_id, g.perdedor_id)
     ) then
    raise exception using errcode = '22023', message = 'fusion_superada';
  end if;
  -- Federico's decision (2026-11-09): never overwrite what Coni changed after the merge. The winner's pillars must be
  -- the ones the merge left, and the loser (merged away) must have none. Only what a pillar means is compared, as a
  -- set: saving the same pillars again rewrites every row with new dates (cambiar_pilares_de_tema) and must not block.
  if exists (
       (select p.pilar_id, p.red, p.es_capa, p.fuerza from public.tema_pilares p where p.tema_id = f.ganador_id
        except
        select x.pilar_id, x.red, x.es_capa, x.fuerza
          from jsonb_to_recordset(f.pilares_ganador_despues) as x(pilar_id uuid, red text, es_capa boolean, fuerza text))
       union all
       (select x.pilar_id, x.red, x.es_capa, x.fuerza
          from jsonb_to_recordset(f.pilares_ganador_despues) as x(pilar_id uuid, red text, es_capa boolean, fuerza text)
        except
        select p.pilar_id, p.red, p.es_capa, p.fuerza from public.tema_pilares p where p.tema_id = f.ganador_id)
     )
     or exists (select 1 from public.tema_pilares where tema_id = f.perdedor_id)
     -- Putting the snapshot back needs each of its pillars to still exist: refuse here, not with a foreign key error.
     or exists (
       select 1 from jsonb_to_recordset(f.pilares_ganador || f.pilares_perdedor) as x(pilar_id uuid, red text, es_capa boolean)
       where not exists (select 1 from public.categorias c where c.id = x.pilar_id and c.red = x.red and c.es_capa = x.es_capa)
     ) then
    raise exception using errcode = '22023', message = 'pilares_cambiados';
  end if;
  -- Neither topic may come back empty: the winner keeps a claim of its own, the loser gets one back.
  if not exists (
       select 1 from public.afirmaciones a
       where a.tema_id = f.ganador_id and not a.excluida
         and not exists (select 1 from public.fusiones_afirmaciones fa
                          where fa.fusion_id = f.id and fa.afirmacion_id = a.id)
     )
     or not exists (
       select 1 from public.fusiones_afirmaciones fa
       join public.afirmaciones a on a.id = fa.afirmacion_id
       where fa.fusion_id = f.id and a.tema_id = f.ganador_id and not a.excluida
     ) then
    raise exception using errcode = '22023', message = 'fusion_sin_ideas';
  end if;

  -- Only the claims the merge moved and that still sit in the winner (one excluded since stays as it is).
  update public.afirmaciones a
     set tema_id = fa.tema_origen
    from public.fusiones_afirmaciones fa
   where fa.fusion_id = f.id and a.id = fa.afirmacion_id and a.tema_id = f.ganador_id;

  delete from public.tema_pilares where tema_id = f.ganador_id;
  insert into public.tema_pilares
  select * from jsonb_populate_recordset(null::public.tema_pilares, f.pilares_ganador || f.pilares_perdedor);

  update public.temas set fusionado_en = f.perdedor_id
   where id = any(f.encadenados) and fusionado_en = f.ganador_id;
  update public.temas
     set alias = array(
           select x.nombre_alias from unnest(ganador.alias) with ordinality as x(nombre_alias, ord)
           where not (x.nombre_alias = any(f.alias_agregados)) order by x.ord
         ),
         centroide = coalesce((
           select extensions.avg(a.vector) from public.afirmaciones a
           where a.tema_id = f.ganador_id and not a.excluida and a.vector is not null
         ), centroide),
         actualizado_en = now()
   where id = f.ganador_id;
  update public.temas
     set fusionado_en = null,
         centroide = coalesce((
           select extensions.avg(a.vector) from public.afirmaciones a
           where a.tema_id = f.perdedor_id and not a.excluida and a.vector is not null
         ), centroide),
         actualizado_en = now()
   where id = f.perdedor_id;

  update public.fusiones set estado = 'deshecha', deshecha_en = now() where id = f.id;
  perform public.recordar_rechazo_de_coni(f.ganador_id, f.perdedor_id);
  insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id)
  values ('fusion_rechazada', f.ganador_id, f.perdedor_id);
end $$;

revoke execute on function public.deshacer_fusion(uuid) from public, anon;
grant execute on function public.deshacer_fusion(uuid) to authenticated;
