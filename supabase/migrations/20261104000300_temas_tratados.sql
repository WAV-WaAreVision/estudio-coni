-- "Tratado" per network (spec 2026-11-04, part 15b, section 1): a live topic is treated on a network when some piece
-- went out there (`publicado` or `subido_a_mano`). Today the only path from a piece to a topic is its idea's theory
-- (`teorias.temas`: no foreign key, not moved by merges), so each id is followed along `fusionado_en`, five merges at
-- most like `destinoDeTema`; a merged topic counts for the one that stayed. An idea without a theory does not count
-- yet: a stored link can replace this body later without changing its columns. Security invoker: only Coni reads
-- `publicaciones`, so WAV sees no row.
create view public.temas_tratados with (security_invoker = true) as
with recursive
  salidas as (
    select distinct p.destino as red, u.tema_id
      from public.publicaciones p
      join public.piezas pz on pz.id = p.pieza_id
      join public.ideas i on i.id = pz.idea_id
      join public.teorias t on t.id = i.teoria_id
      cross join lateral unnest(t.temas) as u (tema_id)
     where p.estado in ('publicado', 'subido_a_mano')
  ),
  camino (red, tema_id, fusionado_en, pasos) as (
    select s.red, tm.id, tm.fusionado_en, 0
      from salidas s
      join public.temas tm on tm.id = s.tema_id
    union all
    select c.red, tm.id, tm.fusionado_en, c.pasos + 1
      from camino c
      join public.temas tm on tm.id = c.fusionado_en
     where c.pasos < 5
  )
select distinct tema_id, red
  from camino
 where fusionado_en is null;

revoke all on public.temas_tratados from anon, authenticated;
grant select on public.temas_tratados to authenticated;

-- The topics of Temas on a network (spec 2026-11-04, part 15b, section 1): every `temas_resumen` row plus `tratado`
-- for `p_red`. A pillar of that network narrows to the topics whose main pillar there it is; a layer, to those with
-- its lens; a pillar of the other network or an unknown one, to nothing. It replaces `temas_de_pilar` in the app; that
-- one stays while the old Vercel code can call it (dropped by a later cleanup migration). Read with keyset paging, so
-- no list of ids travels in the URL. Security invoker: the RLS of every table under it still applies.
create function public.temas_de_red(p_red text, p_pilar uuid default null)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  categoria_id uuid,
  alias text[],
  creado_en timestamptz,
  actualizado_en timestamptz,
  afirmaciones integer,
  autores integer,
  evidencia jsonb,
  cubierto_por_coni boolean,
  ultima_afirmacion timestamptz,
  tratado boolean
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.nombre, r.descripcion, r.categoria_id, r.alias, r.creado_en, r.actualizado_en, r.afirmaciones,
         r.autores, r.evidencia, r.cubierto_por_coni, r.ultima_afirmacion, x.tema_id is not null as tratado
    from public.temas_resumen r
    left join public.temas_tratados x on x.tema_id = r.id and x.red = p_red
   where p_pilar is null
      or exists (
        select 1
          from public.tema_pilares p
         where p.tema_id = r.id
           and p.pilar_id = p_pilar
           and p.red = p_red
           and (p.es_capa or p.fuerza = 'alta')
      )
$$;

revoke all on function public.temas_de_red(text, uuid) from public, anon;
grant execute on function public.temas_de_red(text, uuid) to authenticated;
