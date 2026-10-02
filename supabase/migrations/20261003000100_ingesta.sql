create extension if not exists unaccent with schema extensions;

-- unaccent() is only stable; a generated column needs an immutable expression.
create function public.unaccent_inmutable(texto text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, texto)
$$;

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  nombre_normalizado text generated always as (public.unaccent_inmutable(lower(btrim(nombre)))) stored unique,
  creada_por uuid references auth.users (id),
  creada_en timestamptz not null default now()
);

insert into public.categorias (slug, nombre) values
  ('pareja', 'Pareja y conversación'),
  ('deseo', 'Deseo y sexualidad'),
  ('autoestima', 'Autoestima y "ser tu propia diosa"'),
  ('limites', 'Género y límites'),
  ('bienestar', 'Bienestar emocional'),
  ('general', 'General');

create table public.materiales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('documento', 'link', 'audio', 'video', 'imagen', 'post')),
  titulo text,
  autor text,
  categoria_id uuid not null references public.categorias (id) on delete restrict,
  etiquetas text[] not null default '{}',
  -- A reference only for videos and images: it is never fetched.
  origen_url text,
  archivo_clave text,
  texto_pegado text,
  texto_clave text,
  idioma_original text check (idioma_original ~ '^[a-z]{2}$'),
  estado text not null default 'procesando' check (estado in ('procesando', 'listo', 'fallido')),
  motivo_fallo text,
  declaracion_sin_pacientes_en timestamptz not null,
  subido_por uuid not null default auth.uid() references auth.users (id),
  creado_en timestamptz not null default now(),
  constraint material_con_contenido check (num_nonnulls(origen_url, archivo_clave, texto_pegado) >= 1)
);
create index materiales_categoria on public.materiales (categoria_id);
create index materiales_subido_por on public.materiales (subido_por);

create table public.materiales_archivos (
  material_id uuid not null references public.materiales (id) on delete cascade,
  orden smallint not null check (orden between 1 and 20),
  archivo_clave text not null,
  primary key (material_id, orden)
);

create table public.fichas (
  material_id uuid primary key references public.materiales (id) on delete cascade,
  resumen text not null,
  ideas_clave jsonb not null,
  citas jsonb not null,
  fuente jsonb not null,
  editada_por uuid references auth.users (id),
  editada_en timestamptz
);

alter table public.categorias enable row level security;
alter table public.materiales enable row level security;
alter table public.materiales_archivos enable row level security;
alter table public.fichas enable row level security;

revoke all on public.categorias, public.materiales, public.materiales_archivos, public.fichas from anon, authenticated;
grant select on public.categorias, public.materiales, public.materiales_archivos, public.fichas to authenticated;
grant insert (tipo, titulo, autor, categoria_id, etiquetas, origen_url, archivo_clave, texto_pegado,
  declaracion_sin_pacientes_en, subido_por) on public.materiales to authenticated;
grant update (titulo, autor, categoria_id, etiquetas) on public.materiales to authenticated;
grant delete on public.materiales to authenticated;
grant insert, delete on public.materiales_archivos to authenticated;
grant update (resumen, ideas_clave, citas, fuente) on public.fichas to authenticated;

create policy "coni y wav leen categorias" on public.categorias for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create policy "coni y wav leen materiales" on public.materiales for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav suben materiales" on public.materiales for insert to authenticated
  with check ((public.es_coni() or public.es_mantenedor()) and subido_por = auth.uid());
create policy "coni y wav editan materiales" on public.materiales for update to authenticated
  using (public.es_coni() or public.es_mantenedor()) with check (public.es_coni() or public.es_mantenedor());
create policy "coni o quien subio borra materiales" on public.materiales for delete to authenticated
  using (public.es_coni() or (public.es_mantenedor() and subido_por = auth.uid()));

create policy "coni y wav leen archivos" on public.materiales_archivos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav suben archivos" on public.materiales_archivos for insert to authenticated
  with check (public.es_coni() or public.es_mantenedor());
create policy "coni o quien subio borra archivos" on public.materiales_archivos for delete to authenticated
  using (
    public.es_coni()
    or (public.es_mantenedor() and exists (
      select 1 from public.materiales m where m.id = material_id and m.subido_por = auth.uid()
    ))
  );

create policy "coni y wav leen fichas" on public.fichas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav editan fichas" on public.fichas for update to authenticated
  using (public.es_coni() or public.es_mantenedor()) with check (public.es_coni() or public.es_mantenedor());

create function public.sellar_edicion_ficha() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.resumen, new.ideas_clave, new.citas, new.fuente)
    is distinct from (old.resumen, old.ideas_clave, old.citas, old.fuente) then
    new.editada_por := auth.uid();
    new.editada_en := now();
  end if;
  return new;
end $$;

create trigger sellar_edicion before update on public.fichas
  for each row execute function public.sellar_edicion_ficha();

create function public.crear_categoria(p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalizado text := public.unaccent_inmutable(lower(btrim(coalesce(p_nombre, ''))));
  existente uuid;
  base text;
  nueva uuid := gen_random_uuid();
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if normalizado = '' then
    raise exception using errcode = '22023', message = 'categoria_vacia';
  end if;
  base := coalesce(nullif(trim(both '-' from regexp_replace(normalizado, '[^a-z0-9]+', '-', 'g')), ''), 'categoria');
  -- Atomic: a concurrent call with the same name or slug conflicts here instead of raising.
  insert into public.categorias (id, slug, nombre, creada_por)
  values (nueva, base, btrim(p_nombre), auth.uid())
  on conflict do nothing
  returning id into existente;
  if existente is not null then
    return existente;
  end if;
  select id into existente from public.categorias where nombre_normalizado = normalizado;
  if existente is not null then
    return existente;
  end if;
  -- Same slug, different name: retry once with a suffix.
  insert into public.categorias (id, slug, nombre, creada_por)
  values (nueva, base || '-' || substr(nueva::text, 1, 8), btrim(p_nombre), auth.uid())
  on conflict (nombre_normalizado) do nothing
  returning id into existente;
  if existente is null then
    select id into existente from public.categorias where nombre_normalizado = normalizado;
  end if;
  return existente;
end $$;

create function public.renombrar_categoria(p_id uuid, p_nombre text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  normalizado text := public.unaccent_inmutable(lower(btrim(coalesce(p_nombre, ''))));
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if normalizado = '' then
    raise exception using errcode = '22023', message = 'categoria_vacia';
  end if;
  if exists (select 1 from public.categorias where nombre_normalizado = normalizado and id <> p_id) then
    raise exception using errcode = '23505', message = 'categoria_repetida';
  end if;
  update public.categorias set nombre = btrim(p_nombre) where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'categoria_inexistente';
  end if;
end $$;

revoke execute on function public.crear_categoria(text), public.renombrar_categoria(uuid, text) from public, anon;
grant execute on function public.crear_categoria(text), public.renombrar_categoria(uuid, text) to authenticated;

create trigger auditar after insert or update or delete on public.categorias
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.materiales
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.fichas
  for each row execute function public.registrar_evento();
