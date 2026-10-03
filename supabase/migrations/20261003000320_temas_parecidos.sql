-- Pairs of active topics whose centroids are alike, most alike first: the candidates of the nightly merge.
create function public.temas_parecidos(p_umbral float)
returns table (a uuid, b uuid, similitud float)
language sql stable set search_path = '' as $$
  select x.id, y.id, 1 - (x.centroide operator(extensions.<=>) y.centroide)
  from public.temas x
  join public.temas y on x.id < y.id
  where x.fusionado_en is null
    and y.fusionado_en is null
    and 1 - (x.centroide operator(extensions.<=>) y.centroide) >= p_umbral
  order by 3 desc, x.id, y.id
$$;

revoke execute on function public.temas_parecidos(float) from public, anon, authenticated;
grant execute on function public.temas_parecidos(float) to service_role;
