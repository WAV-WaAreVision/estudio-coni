-- The source becomes visible (spec 2026-10-17, decision 7). WAV fills the year; no year is better than a guessed one.
alter table public.materiales add column anio smallint check (anio between 1900 and 2100);

-- Same backing as 20261003000510 plus, per claim, its source: the claim's author and its material's title and year.
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
        order by (f.evidencia in ('estudio', 'clinica')) desc, f.id
        limit p_limite
      ) e
    ), '[]'::jsonb)
  )
  from public.ideas i
  join public.teorias t on t.id = i.teoria_id and t.origen = 'motor'
  where i.id = p_idea and i.origen = 'motor'
$$;
