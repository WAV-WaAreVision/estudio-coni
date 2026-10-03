-- Topics group claims by meaning. A topic's centroid is the mean of its claims' vectors, kept by the service role.
create table public.temas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (public.unaccent_inmutable(lower(btrim(nombre)))) stored unique,
  descripcion text,
  categoria_id uuid references public.categorias (id) on delete set null,
  centroide extensions.vector(1024) not null,
  alias text[] not null default '{}',
  fusionado_en uuid references public.temas (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index temas_centroide on public.temas using hnsw (centroide extensions.vector_cosine_ops);
create index temas_categoria on public.temas (categoria_id);
create index temas_fusionado_en on public.temas (fusionado_en);

-- A claim is one idea stated by an author inside a material, with the verbatim quote that backs it.
create table public.afirmaciones (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales (id) on delete cascade,
  autor_id uuid not null references public.autores (id) on delete restrict,
  tramo int not null,
  ubicacion jsonb not null,
  idioma text,
  texto text not null check (char_length(texto) <= 280),
  cita text not null,
  tipo text not null check (tipo in ('definicion', 'causa', 'consecuencia', 'mito', 'consejo', 'dato', 'experiencia')),
  evidencia text not null check (evidencia in ('estudio', 'clinica', 'opinion', 'testimonio')),
  postura text,
  publico text,
  dolor text,
  emocion text,
  gancho text,
  vector extensions.vector(1024),
  tema_id uuid references public.temas (id) on delete set null,
  excluida boolean not null default false,
  creada_en timestamptz not null default now()
);
create index afirmaciones_vector on public.afirmaciones using hnsw (vector extensions.vector_cosine_ops);
create index afirmaciones_tema on public.afirmaciones (tema_id);
create index afirmaciones_autor on public.afirmaciones (autor_id);
create index afirmaciones_material on public.afirmaciones (material_id);

alter table public.temas enable row level security;
alter table public.afirmaciones enable row level security;
revoke all on public.temas, public.afirmaciones from anon, authenticated;
grant select on public.temas, public.afirmaciones to authenticated;

create policy "coni y wav leen temas" on public.temas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav leen afirmaciones" on public.afirmaciones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

-- Audited: temas. Not audited: afirmaciones, because one material yields hundreds of rows and the
-- audit log would drown in them; the only member write (excluir_afirmacion) is a flag on the row.
-- Centroid refreshes are not audited either: they happen on every assignment and each row carries 1024 floats.
create trigger auditar after insert or delete or update of nombre, descripcion, categoria_id, alias, fusionado_en
  on public.temas
  for each row execute function public.registrar_evento();

create function public.excluir_afirmacion(p_id uuid, p_excluida boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  -- Excluding detaches the claim so the next maintenance run recomputes its topic (and the centroid).
  update public.afirmaciones
  set excluida = p_excluida, tema_id = case when p_excluida then null else tema_id end
  where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'afirmacion_inexistente';
  end if;
end $$;

create view public.temas_resumen with (security_invoker = true) as
select
  t.id, t.nombre, t.descripcion, t.categoria_id, t.alias, t.creado_en, t.actualizado_en,
  coalesce(r.afirmaciones, 0) as afirmaciones,
  coalesce(r.autores, 0) as autores,
  coalesce(r.evidencia, '{}'::jsonb) as evidencia,
  coalesce(r.cubierto_por_coni, false) as cubierto_por_coni,
  r.ultima_afirmacion
from public.temas t
left join lateral (
  select
    count(*)::int as afirmaciones,
    count(distinct x.autor_id)::int as autores,
    (select jsonb_object_agg(e.evidencia, e.n)
     from (
       select a2.evidencia, count(*)::int as n
       from public.afirmaciones a2
       where a2.tema_id = t.id and not a2.excluida
       group by a2.evidencia
     ) e) as evidencia,
    bool_or(x.rol = 'voz_propia') as cubierto_por_coni,
    max(x.creada_en) as ultima_afirmacion
  from (
    select a.autor_id, a.creada_en, m.rol
    from public.afirmaciones a
    join public.materiales m on m.id = a.material_id
    where a.tema_id = t.id and not a.excluida
  ) x
) r on true
where t.fusionado_en is null;
grant select on public.temas_resumen to authenticated;

create function public.tema_mas_cercano(p_vector extensions.vector, p_umbral float)
returns table (tema_id uuid, similitud float)
language sql stable set search_path = '' as $$
  select id, 1 - (centroide operator(extensions.<=>) p_vector)
  from public.temas
  where fusionado_en is null
    and 1 - (centroide operator(extensions.<=>) p_vector) >= p_umbral
  order by centroide operator(extensions.<=>) p_vector
  limit 1
$$;

-- Redefined so a merge also moves the claims of the absorbed author.
create or replace function public.fusionar_autores(p_origen uuid, p_destino uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  origen public.autores;
  destino public.autores;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_origen is not distinct from p_destino then
    raise exception using errcode = '22023', message = 'autores_iguales';
  end if;
  select * into origen from public.autores where id = p_origen for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'autor_inexistente';
  end if;
  select * into destino from public.autores where id = p_destino for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'autor_inexistente';
  end if;
  update public.materiales set autor_id = p_destino where autor_id = p_origen;
  update public.afirmaciones set autor_id = p_destino where autor_id = p_origen;
  update public.autores
  set alias = destino.alias || coalesce((
    select array_agg(nombre_alias order by ord)
    from (
      select distinct on (public.unaccent_inmutable(lower(btrim(c.nombre_alias)))) c.nombre_alias, c.ord
      from unnest(array[origen.nombre] || origen.alias) with ordinality as c(nombre_alias, ord)
      where public.unaccent_inmutable(lower(btrim(c.nombre_alias))) <> destino.nombre_normalizado
        and not exists (
          select 1 from unnest(destino.alias) d
          where public.unaccent_inmutable(lower(btrim(d))) = public.unaccent_inmutable(lower(btrim(c.nombre_alias)))
        )
      order by public.unaccent_inmutable(lower(btrim(c.nombre_alias))), c.ord
    ) unicos
  ), '{}')
  where id = p_destino;
  delete from public.autores where id = p_origen;
end $$;

revoke execute on function public.excluir_afirmacion(uuid, boolean) from public, anon;
grant execute on function public.excluir_afirmacion(uuid, boolean) to authenticated;
revoke execute on function public.tema_mas_cercano(extensions.vector, float) from public, anon, authenticated;
grant execute on function public.tema_mas_cercano(extensions.vector, float) to service_role;
revoke execute on function public.fusionar_autores(uuid, uuid) from public, anon;
grant execute on function public.fusionar_autores(uuid, uuid) to authenticated;
