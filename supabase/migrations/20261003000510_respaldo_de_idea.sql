-- C3: the backing of an engine idea, in the shape the piece stores (`piezas.respaldo`). Only the producer, which runs
-- as the service role, reads it. Excluded claims never inspire a script; studies and clinical practice go first when
-- there are more than p_limite. A quote is cut at 500 characters to bound the prompt.
create function public.respaldo_de_idea(p_idea uuid, p_limite int)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'teoria', jsonb_build_object(
      'id', t.id, 'titulo', coalesce(t.titulo, ''), 'tesis', coalesce(t.tesis, ''), 'porQue', coalesce(t.por_que, '')
    ),
    'afirmaciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'texto', e.texto, 'cita', e.cita, 'aporte', e.aporte, 'autor', e.autor, 'deConi', e.de_coni, 'esPersona', e.es_persona
        ) order by e.id
      )
      from (
        select f.id, f.texto, left(f.cita, 500) as cita, ta.aporte, a.nombre as autor, a.tipo = 'coni' as de_coni, a.tipo = 'persona' as es_persona
        from public.teoria_afirmaciones ta
        join public.afirmaciones f on f.id = ta.afirmacion_id and not f.excluida
        join public.autores a on a.id = f.autor_id
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

revoke execute on function public.respaldo_de_idea(uuid, int) from public, anon, authenticated;
grant execute on function public.respaldo_de_idea(uuid, int) to service_role;
