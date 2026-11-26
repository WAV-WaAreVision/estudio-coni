-- Change 6b: the hooks library. Adds a table, a column and a view; changes no existing row.

-- Coni's favorite hooks, kept by claim so the same star works for a new hook (`ganchos`) and an old free-text one
-- (`afirmaciones.gancho`). Change 7's reprocess must keep claim ids, or the cascade below drops every favorite.
create table public.ganchos_favoritos (
  afirmacion_id uuid primary key references public.afirmaciones (id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.ganchos_favoritos enable row level security;
revoke all on public.ganchos_favoritos from anon, authenticated;
grant select, insert, delete on public.ganchos_favoritos to authenticated;
grant all on public.ganchos_favoritos to service_role;
create policy "coni y wav leen favoritos de ganchos" on public.ganchos_favoritos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni marca favoritos de ganchos" on public.ganchos_favoritos for insert to authenticated
  with check (public.es_coni());
create policy "coni quita favoritos de ganchos" on public.ganchos_favoritos for delete to authenticated
  using (public.es_coni());

-- «Mis tipos»: values of the vigente `gancho` list, written through the policy "coni edita ajustes" (guardarAjuste
-- drops anything the list does not have). A value later retired stays stored and the screen ignores it.
alter table public.ajustes add column tipos_de_gancho_preferidos text[] not null default '{}';

-- One row per hook. A claim has at most one row in `ganchos` (unique), and its free text counts only without one,
-- so no claim appears twice. Hidden claims and anything deleted with «Deshacer» stay out: the material through
-- materiales_visibles (inner), the author through autores_visibles (left, its id and name go null). The network comes
-- from the topic's pillars, layers excluded; no topic or no pillar is an empty array («Sin red»).
create view public.biblioteca_de_ganchos with (security_invoker = true) as
select
  a.id as afirmacion_id,
  coalesce(g.frase_exacta, a.gancho) as frase_exacta,
  g.frase_sin_gancho,
  coalesce(g.tipo, 'sin_clasificar') as tipo,
  g.certeza,
  g.id is not null as clasificado,
  coalesce(g.creada_en, a.creada_en) as creado_en,
  a.material_id,
  m.titulo as material_titulo,
  a.ubicacion,
  au.id as autor_id,
  au.nombre as autor_nombre,
  a.tema_id,
  t.nombre as tema_nombre,
  coalesce(
    (select jsonb_agg(
              jsonb_build_object('red', tp.red, 'pilar_id', tp.pilar_id, 'nombre', coalesce(c.nombre_corto, c.nombre))
              order by tp.red, (tp.fuerza = 'alta') desc, c.orden)
       from public.tema_pilares tp
       join public.categorias c on c.id = tp.pilar_id
      where tp.tema_id = a.tema_id and not tp.es_capa),
    '[]'::jsonb
  ) as pilares,
  exists (select 1 from public.ganchos_favoritos f where f.afirmacion_id = a.id) as favorito
from public.afirmaciones a
join public.materiales_visibles m on m.id = a.material_id
left join public.autores_visibles au on au.id = a.autor_id
left join public.ganchos g on g.afirmacion_id = a.id
left join public.temas t on t.id = a.tema_id
where not a.excluida
  and (g.id is not null or nullif(btrim(a.gancho), '') is not null);

revoke all on public.biblioteca_de_ganchos from anon, authenticated;
grant select on public.biblioteca_de_ganchos to authenticated;
