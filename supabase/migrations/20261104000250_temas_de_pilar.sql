-- The topics a pillar lists in Temas (spec 2026-11-04, section 2): those it is the main pillar of in its network, or,
-- for a layer, those with its lens. A secondary pillar never lists a topic. The join runs here so the reader never
-- names hundreds of topic ids in the request URL. Security invoker: the RLS of temas and tema_pilares still applies.
create function public.temas_de_pilar(p_pilar uuid)
returns setof public.temas_resumen
language sql stable security invoker set search_path = '' as $$
  select r.*
    from public.temas_resumen r
   where exists (
     select 1
       from public.tema_pilares p
      where p.tema_id = r.id
        and p.pilar_id = p_pilar
        and (p.es_capa or p.fuerza = 'alta')
   )
$$;

revoke all on function public.temas_de_pilar(uuid) from public, anon;
grant execute on function public.temas_de_pilar(uuid) to authenticated;
