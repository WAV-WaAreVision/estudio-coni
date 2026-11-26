-- Change 6a: guía o consenso counts as strong evidence when the engine orders claims (same bodies as 20261003000420
-- and 20261017000110, only the strong set changes). sin_clasificar stays with the weak ones.
create or replace function public.motor_afirmaciones_de_tema(p_tema uuid, p_limite int)
returns table (
  id uuid, autor text, texto text, cita text, tipo text, evidencia text,
  publico text, dolor text, emocion text
)
language sql stable set search_path = '' as $$
  select f.id, a.nombre, f.texto, f.cita, f.tipo, f.evidencia, f.publico, f.dolor, f.emocion
  from public.afirmaciones f
  join public.autores a on a.id = f.autor_id
  join public.temas t on t.id = f.tema_id
  where f.tema_id = p_tema and not f.excluida
  order by (f.evidencia in ('estudio', 'guia_consenso', 'clinica')) desc,
           (f.vector operator(extensions.<#>) t.centroide) * -1 desc nulls last,
           f.id
  limit p_limite
$$;


create or replace function public.respaldo_de_idea(p_idea uuid, p_limite int)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'teoria', jsonb_build_object(
      'id', t.id, 'titulo', coalesce(t.titulo, ''), 'tesis', coalesce(t.tesis, ''), 'porQue', coalesce(t.por_que, '')
    ),
    'afirmaciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'texto', e.texto, 'cita', e.cita, 'aporte', e.aporte, 'autor', e.autor, 'deConi', e.de_coni,
          'esPersona', e.es_persona,
          'fuente', jsonb_build_object('autor', e.autor, 'titulo', e.titulo_material, 'anio', e.anio)
        ) order by e.id
      )
      from (
        select f.id, f.texto, left(f.cita, 500) as cita, ta.aporte, a.nombre as autor, a.tipo = 'coni' as de_coni,
               a.tipo = 'persona' as es_persona, m.titulo as titulo_material, m.anio
        from public.teoria_afirmaciones ta
        join public.afirmaciones f on f.id = ta.afirmacion_id and not f.excluida
        join public.autores a on a.id = f.autor_id
        join public.materiales m on m.id = f.material_id
        where ta.teoria_id = t.id
        order by (f.evidencia in ('estudio', 'guia_consenso', 'clinica')) desc, f.id
        limit p_limite
      ) e
    ), '[]'::jsonb)
  )
  from public.ideas i
  join public.teorias t on t.id = i.teoria_id and t.origen = 'motor'
  where i.id = p_idea and i.origen = 'motor'
$$;
