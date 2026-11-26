-- Change 6a: `motor_temas` counts guía o consenso among the strong evidence, like estudio and clinica (the engine's
-- claim ordering already does, 20261114000400). Same body and signature as 20261104000240 plus the new term.
create or replace function public.motor_temas()
returns table (
  tema_id uuid, nombre text, pilar text, afirmaciones int, autores int, evidencia_fuerte int, cubierto_por_coni boolean,
  pilares text[]
)
language sql stable set search_path = '' as $$
  select r.id, r.nombre, c.slug, r.afirmaciones, r.autores,
         coalesce((r.evidencia ->> 'estudio')::int, 0) + coalesce((r.evidencia ->> 'clinica')::int, 0)
           + coalesce((r.evidencia ->> 'guia_consenso')::int, 0),
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
