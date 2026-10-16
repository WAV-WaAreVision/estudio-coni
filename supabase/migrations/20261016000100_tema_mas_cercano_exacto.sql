-- tema_mas_cercano searched through the HNSW index on temas.centroide, which is approximate: it hands over about
-- hnsw.ef_search candidates and drops merged topics only afterwards, so once enough merged or near-duplicate topics
-- sit close to a claim the active topic is missed and the engine opens a duplicate. The topic bank is small (hundreds
-- of rows), so an exact search costs milliseconds. The materialized CTE keeps the planner from ordering through the
-- index. Same result rule as 20261003000352: the 10 closest active topics by cosine, then the best inner product.
create or replace function public.tema_mas_cercano(p_vector extensions.vector, p_umbral float)
returns table (tema_id uuid, similitud float)
language sql stable set search_path = '' as $$
  with activos as materialized (
    select t.id,
           t.centroide operator(extensions.<=>) p_vector as distancia,
           (p_vector operator(extensions.<#>) t.centroide) * -1 as puntaje
    from public.temas t
    where t.fusionado_en is null
  )
  select c.id, c.puntaje
  from (select a.id, a.puntaje from activos a order by a.distancia limit 10) c
  where c.puntaje >= p_umbral
  order by c.puntaje desc, c.id
  limit 1
$$;
