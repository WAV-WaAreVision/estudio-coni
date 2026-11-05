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
