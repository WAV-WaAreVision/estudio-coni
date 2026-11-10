-- Issue 22: the merge candidates leave out (1) every pair that touches a topic waiting in a proposal, so no automatic
-- merge makes a proposal stale before Coni decides it; (2) stored subtopic pairs, either way; (3) pairs Coni rejected,
-- always; (4) pairs Claude rejected, until either topic has 30 % more live claims than at the rejection or the vigente
-- model is not the rejection's. A rejection without counts or model (old Trigger code) counts as 0 and no model, so it
-- is asked again once and then stored with both. Everything else is 20261003000352's.
create or replace function public.temas_parecidos(p_umbral float)
returns table (a uuid, b uuid, similitud float)
language sql stable set search_path = '' as $$
  select x.id, y.id, (x.centroide operator(extensions.<#>) y.centroide) * -1
  from public.temas x
  join public.temas y on x.id < y.id
  where x.fusionado_en is null
    and y.fusionado_en is null
    and (x.centroide operator(extensions.<#>) y.centroide) * -1 >= p_umbral
    and not exists (
      select 1 from public.fusiones f
      where f.estado = 'propuesta'
        and (f.ganador_id in (x.id, y.id) or f.perdedor_id in (x.id, y.id))
    )
    and not exists (
      select 1 from public.temas_subtemas s
      where (s.tema_id = x.id and s.padre_id = y.id) or (s.tema_id = y.id and s.padre_id = x.id)
    )
    and not exists (
      select 1 from public.temas_fusion_rechazada r
      where r.tema_a = x.id and r.tema_b = y.id
        and (
          r.origen = 'coni'
          or (
            r.modelo = public.modelo_de_huellas_vigente()
            and public.afirmaciones_vivas(x.id) * 10 < coalesce(r.afirmaciones_a, 0) * 13
            and public.afirmaciones_vivas(y.id) * 10 < coalesce(r.afirmaciones_b, 0) * 13
          )
        )
    )
  order by 3 desc, x.id, y.id
$$;
