-- The engine reads a topic's main pillars (spec 2026-11-04, part 15a, section 4). Until the Trigger deploy the old
-- tasks keep working against this schema (section 7): `motor_temas` keeps `pilar` (the category's slug) and adds
-- `pilares` at the end; `motor_pares` keeps the old rule unless the new parameter asks for the new one. Secondaries are
-- stored for the Taller (change 21) and not used here.
drop function public.motor_temas();
create function public.motor_temas()
returns table (
  tema_id uuid, nombre text, pilar text, afirmaciones int, autores int, evidencia_fuerte int, cubierto_por_coni boolean,
  pilares text[]
)
language sql stable set search_path = '' as $$
  select r.id, r.nombre, c.slug, r.afirmaciones, r.autores,
         coalesce((r.evidencia ->> 'estudio')::int, 0) + coalesce((r.evidencia ->> 'clinica')::int, 0),
         r.cubierto_por_coni,
         coalesce(
           (select array_agg(p.slug order by p.red, p.orden)
              from public.tema_pilares tp
              join public.categorias p on p.id = tp.pilar_id
             where tp.tema_id = r.id and tp.fuerza = 'alta'),
           '{}'
         )
  from public.temas_resumen r
  left join public.categorias c on c.id = r.categoria_id
  order by r.id
$$;

-- Pairs of active topics (a < b), both with at least `p_minimo_autores` authors. Old rule (default): both have a
-- category and they differ. New rule (`p_por_pilares_de_red`): no network gives both the same main pillar; a topic
-- without main pillars crosses with any. `puente` as in 20261003000410.
drop function public.motor_pares(int);
create function public.motor_pares(p_minimo_autores int, p_por_pilares_de_red boolean default false)
returns table (a uuid, b uuid, puente float, autores_comunes int)
language sql stable set search_path = '' as $$
  with candidatos as (
    select t.id, t.centroide, c.slug as pilar
    from public.temas_resumen r
    join public.temas t on t.id = r.id
    left join public.categorias c on c.id = r.categoria_id
    where r.autores >= p_minimo_autores
      and (p_por_pilares_de_red or c.id is not null)
  ),
  principales as (
    select tp.tema_id, tp.red, tp.pilar_id
    from public.tema_pilares tp
    where tp.fuerza = 'alta' and tp.tema_id in (select id from candidatos)
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
  join candidatos y on x.id < y.id
   and case
         when p_por_pilares_de_red then not exists (
           select 1 from principales px
           join principales py on py.red = px.red and py.pilar_id = px.pilar_id
           where px.tema_id = x.id and py.tema_id = y.id
         )
         else x.pilar <> y.pilar
       end
  order by x.id, y.id
$$;

revoke execute on function public.motor_temas(), public.motor_pares(int, boolean) from public, anon, authenticated;
grant execute on function public.motor_temas(), public.motor_pares(int, boolean) to service_role;
