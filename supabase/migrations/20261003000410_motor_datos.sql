-- Data the weekly engine reads to score crossings (C2). Both functions are for the service role: the engine runs in
-- a scheduled task, never as a person.

-- One row per active topic. `pilar` is the slug of the topic's category, null when it has none.
create function public.motor_temas()
returns table (
  tema_id uuid, nombre text, pilar text, afirmaciones int, autores int, evidencia_fuerte int, cubierto_por_coni boolean
)
language sql stable set search_path = '' as $$
  select r.id, r.nombre, c.slug, r.afirmaciones, r.autores,
         coalesce((r.evidencia ->> 'estudio')::int, 0) + coalesce((r.evidencia ->> 'clinica')::int, 0),
         r.cubierto_por_coni
  from public.temas_resumen r
  left join public.categorias c on c.id = r.categoria_id
  order by r.id
$$;

-- Pairs of active topics (a < b) from different pillars, both with at least `p_minimo_autores` authors.
-- `puente` is the mean cross cosine: centroids are means of unit vectors, so their inner product is the average
-- cosine between a member of one topic and a member of the other (see 20261003000351).
create function public.motor_pares(p_minimo_autores int)
returns table (a uuid, b uuid, puente float, autores_comunes int)
language sql stable set search_path = '' as $$
  with candidatos as (
    select t.id, t.centroide, c.slug as pilar
    from public.temas_resumen r
    join public.temas t on t.id = r.id
    join public.categorias c on c.id = r.categoria_id
    where r.autores >= p_minimo_autores
  ),
  autores_por_tema as (
    select distinct f.tema_id, f.autor_id
    from public.afirmaciones f
    where not f.excluida and f.tema_id in (select id from candidatos)
  )
  select x.id, y.id,
         (x.centroide operator(extensions.<#>) y.centroide) * -1,
         (select count(*)::int
          from autores_por_tema p
          join autores_por_tema q on q.autor_id = p.autor_id
          where p.tema_id = x.id and q.tema_id = y.id)
  from candidatos x
  join candidatos y on x.id < y.id and x.pilar <> y.pilar
  order by x.id, y.id
$$;

revoke execute on function public.motor_temas(), public.motor_pares(int) from public, anon, authenticated;
grant execute on function public.motor_temas(), public.motor_pares(int) to service_role;
