-- The claims the weekly engine shows Claude for one topic (C2): studies and clinical practice first, then the ones
-- closest to the topic's centroid. `centroide` is the plain mean of unit vectors, so the inner product orders members
-- by their mean cosine to the topic. Claims without a vector go last.
create function public.motor_afirmaciones_de_tema(p_tema uuid, p_limite int)
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
  order by (f.evidencia in ('estudio', 'clinica')) desc,
           (f.vector operator(extensions.<#>) t.centroide) * -1 desc nulls last,
           f.id
  limit p_limite
$$;

revoke execute on function public.motor_afirmaciones_de_tema(uuid, int) from public, anon, authenticated;
grant execute on function public.motor_afirmaciones_de_tema(uuid, int) to service_role;
