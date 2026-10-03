-- Searches compare against the mean centroid by inner product: for unit vectors, `v · centroide` is the mean cosine
-- between `v` and the topic's members (see 20261003000351).

-- The ten active topics nearest by cosine (the HNSW index) are the candidates; the best mean cosine among them wins
-- if it reaches the threshold. `similitud` is that mean cosine.
create or replace function public.tema_mas_cercano(p_vector extensions.vector, p_umbral float)
returns table (tema_id uuid, similitud float)
language sql stable set search_path = '' as $$
  select c.id, c.puntaje
  from (
    select t.id, (p_vector operator(extensions.<#>) t.centroide) * -1 as puntaje
    from public.temas t
    where t.fusionado_en is null
    order by t.centroide operator(extensions.<=>) p_vector
    limit 10
  ) c
  where c.puntaje >= p_umbral
  order by c.puntaje desc, c.id
  limit 1
$$;

-- Active pairs whose average cross similarity (the inner product of their mean centroids) reaches the threshold,
-- most alike first, without the pairs already rejected. Centroids are means of unit vectors, so their length is at
-- most 1 and the inner product never exceeds the cosine: a pair that passes the first test also passes the cosine
-- one, so no prefilter is needed at the volume of topics there is.
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
      select 1 from public.temas_fusion_rechazada r where r.tema_a = x.id and r.tema_b = y.id
    )
  order by 3 desc, x.id, y.id
$$;
