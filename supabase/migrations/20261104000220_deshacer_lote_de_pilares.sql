-- The way back of a lot (spec 2026-11-04, part 15a, section 3). The old pillars come back first, so the ideas can
-- return to them (`exigir_pilar_activo`). Only ideas still in the bank get their old pillar back: one used meanwhile
-- belongs to its piece's history under the new pillar. Rows Coni changed after the lot (origen 'coni') stay. The new
-- pillars stay active and simply lose the lot's topics. The lot's records go, so the same lot can be applied again.
create function public.deshacer_lote_de_pilares(p_lote text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reactivados int;
  v_ideas int;
  v_filas int;
begin
  perform 1 from public.lotes_de_pilares where lote = p_lote for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'lote_inexistente';
  end if;

  update public.categorias c set activa = true
  from public.lote_pilares_retirados r
  where r.lote = p_lote and r.pilar_id = c.id;
  get diagnostics v_reactivados = row_count;

  update public.ideas i set pilar = a.pilar
  from public.ideas_pilar_antes a
  where a.lote = p_lote and a.idea_id = i.id and i.estado = 'idea';
  get diagnostics v_ideas = row_count;

  delete from public.tema_pilares where lote = p_lote;
  get diagnostics v_filas = row_count;

  delete from public.ideas_pilar_antes where lote = p_lote;
  delete from public.lote_pilares_retirados where lote = p_lote;
  delete from public.lotes_de_pilares where lote = p_lote;

  return jsonb_build_object('filas', v_filas, 'ideas', v_ideas, 'reactivados', v_reactivados);
end $$;

revoke execute on function public.deshacer_lote_de_pilares(text) from public, anon, authenticated;
grant execute on function public.deshacer_lote_de_pilares(text) to service_role;
