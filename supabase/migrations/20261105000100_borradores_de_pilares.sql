-- Pillars per network, part 15c (spec 2026-11-05): "+ Agregar pilar" and "+ Agregar red" save drafts that Coni
-- approves later, as a second step. Drafts live in their own tables, so nothing that reads `categorias` (the engine,
-- the pillar proposals, "Cambiar pilares", the Temas row) ever sees one. Additive: no existing row changes.

create table public.borradores_de_pilar (
  id uuid primary key default gen_random_uuid(),
  red text not null check (red in ('linkedin', 'instagram')),
  -- Trimmed and not empty; the lengths are the form's (`LARGOS` in lib/dominio/biblioteca/borradores.ts).
  nombre text not null check (nombre = btrim(nombre) and nombre <> '' and char_length(nombre) <= 120),
  nombre_corto text not null
    check (nombre_corto = btrim(nombre_corto) and nombre_corto <> '' and char_length(nombre_corto) <= 40),
  descripcion text not null
    check (descripcion = btrim(descripcion) and descripcion <> '' and char_length(descripcion) <= 1500),
  peso numeric(5, 2) not null check (peso > 0 and peso <= 100),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'descartado')),
  -- The pillar it became: only an approved draft has one.
  pilar_id uuid references public.categorias (id),
  creado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  decidido_en timestamptz,
  constraint aprobado_con_pilar check ((estado = 'aprobado') = (pilar_id is not null)),
  constraint decidido_con_fecha check ((estado = 'borrador') = (decidido_en is null))
);

-- A network is development work (manual, recipe, connection, publishing): its draft only keeps her idea and is never
-- approved here. WAV reads it by SQL when the network is built.
create table public.borradores_de_red (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nombre = btrim(nombre) and nombre <> '' and char_length(nombre) <= 60),
  manual text not null default '' check (manual = btrim(manual) and char_length(manual) <= 4000),
  receta text not null default '' check (receta = btrim(receta) and char_length(receta) <= 4000),
  conexion text not null default '' check (conexion = btrim(conexion) and char_length(conexion) <= 4000),
  estado text not null default 'borrador' check (estado in ('borrador', 'descartado')),
  creado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  decidido_en timestamptz,
  constraint decidido_con_fecha check ((estado = 'borrador') = (decidido_en is null))
);

-- Who wrote a draft, and when it was approved or discarded, are sealed here, never sent.
create function public.sellar_borrador() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
  elsif new.estado is distinct from old.estado then
    new.decidido_en := now();
  end if;
  return new;
end $$;

create trigger sellar before insert or update on public.borradores_de_pilar
  for each row execute function public.sellar_borrador();
create trigger sellar before insert or update on public.borradores_de_red
  for each row execute function public.sellar_borrador();

alter table public.borradores_de_pilar enable row level security;
alter table public.borradores_de_red enable row level security;

-- Coni writes the fields of a draft and its state; who, when and the pillar it became are not hers to send. Nobody
-- deletes: discarding is a state, so the history stays.
revoke all on public.borradores_de_pilar, public.borradores_de_red from anon, authenticated, service_role;
grant select on public.borradores_de_pilar, public.borradores_de_red to authenticated, service_role;
grant insert (red, nombre, nombre_corto, descripcion, peso) on public.borradores_de_pilar to authenticated;
grant update (nombre, nombre_corto, descripcion, peso, estado) on public.borradores_de_pilar to authenticated;
grant insert (nombre, manual, receta, conexion) on public.borradores_de_red to authenticated;
grant update (nombre, manual, receta, conexion, estado) on public.borradores_de_red to authenticated;

create policy "coni y wav leen borradores de pilar" on public.borradores_de_pilar for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni guarda borradores de pilar" on public.borradores_de_pilar for insert to authenticated
  with check (public.es_coni() and estado = 'borrador');
-- Only a draft still in `borrador` changes, and only to `borrador` or `descartado`: approving is the RPC's.
create policy "coni edita o descarta borradores de pilar" on public.borradores_de_pilar for update to authenticated
  using (public.es_coni() and estado = 'borrador')
  with check (public.es_coni() and estado in ('borrador', 'descartado'));

create policy "coni y wav leen borradores de red" on public.borradores_de_red for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni guarda borradores de red" on public.borradores_de_red for insert to authenticated
  with check (public.es_coni() and estado = 'borrador');
create policy "coni edita o descarta borradores de red" on public.borradores_de_red for update to authenticated
  using (public.es_coni() and estado = 'borrador')
  with check (public.es_coni() and estado in ('borrador', 'descartado'));

create trigger auditar after insert or update or delete on public.borradores_de_pilar
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.borradores_de_red
  for each row execute function public.registrar_evento();

-- Coni approves a pillar draft (spec section 1), redistributing that network's weights in every stage (decision 8).
-- The stages are today in Chile and every later `desde` the network's active pillars already have. `p_pesos` is
-- {"<desde YYYY-MM-DD>": {"<pilar_id>": peso, "nuevo": peso}}. Stages are written oldest first: in each, the new pillar
-- gets a row of that date (its "nuevo", else the draft's weight) and every pillar whose sent weight differs from its
-- effective one on that date gets a row of that date; a second change on the same day replaces it. Nothing is
-- deleted. The totals are not checked: the screen warns, the database accepts.
create function public.aprobar_borrador_de_pilar(p_borrador uuid, p_pesos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_borrador public.borradores_de_pilar;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_etapas date[];
  v_desde date;
  v_nombre text;
  v_corto text;
  v_base text;
  v_slug text;
  v_sufijo int := 1;
  v_pilar uuid := gen_random_uuid();
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_pesos is null or jsonb_typeof(p_pesos) <> 'object'
     or exists (select 1 from jsonb_each(p_pesos) e where jsonb_typeof(e.value) <> 'object') then
    raise exception using errcode = '22023', message = 'peso_invalido';
  end if;
  -- Every stage is an object by now, so its weights can be listed.
  if exists (
    select 1 from jsonb_each(p_pesos) e
    cross join lateral jsonb_each(e.value) w
    where case
      when jsonb_typeof(w.value) = 'number' then round((w.value)::numeric, 2) <= 0 or (w.value)::numeric > 100
      else true
    end
  ) then
    raise exception using errcode = '22023', message = 'peso_invalido';
  end if;
  -- One approval at a time: the slug, the order and the names are read and written in one go.
  perform pg_advisory_xact_lock(hashtext('aprobar_borrador_de_pilar'));
  select * into v_borrador from public.borradores_de_pilar where id = p_borrador for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'borrador_inexistente';
  end if;
  if v_borrador.estado <> 'borrador' then
    raise exception using errcode = '22023', message = 'borrador_ya_decidido';
  end if;
  select array_agg(distinct s.desde order by s.desde) into v_etapas
  from (
    select v_hoy as desde
    union all
    select w.desde
    from public.pilar_pesos w
    join public.categorias c on c.id = w.pilar_id
    where c.es_pilar and c.activa and not c.es_capa and c.red = v_borrador.red and w.desde > v_hoy
  ) s;
  -- A stage the screen showed that is gone, or a day that changed since it opened: she reloads (decision 6).
  if exists (
    select 1 from jsonb_object_keys(p_pesos) k
    where k not in (select to_char(e.desde, 'YYYY-MM-DD') from unnest(v_etapas) as e (desde))
  ) then
    raise exception using errcode = '22023', message = 'etapa_invalida';
  end if;
  -- A layer has no weight and a retired pillar no say: only the network's active pillars may be named.
  if exists (
    select 1 from jsonb_each(p_pesos) e
    cross join lateral jsonb_object_keys(e.value) k
    where k <> 'nuevo'
      and not exists (
        select 1 from public.categorias c
        where c.id::text = k and c.es_pilar and c.activa and not c.es_capa and c.red = v_borrador.red
      )
  ) then
    raise exception using errcode = '22023', message = 'pilar_de_otra_red';
  end if;
  -- Any row of any state, so a retired pillar's name cannot be shadowed; name and short name, both ways.
  v_nombre := public.unaccent_inmutable(lower(btrim(v_borrador.nombre)));
  v_corto := public.unaccent_inmutable(lower(btrim(v_borrador.nombre_corto)));
  if exists (
    select 1 from public.categorias c
    where c.nombre_normalizado in (v_nombre, v_corto)
       or public.unaccent_inmutable(lower(btrim(c.nombre_corto))) in (v_nombre, v_corto)
  ) then
    raise exception using errcode = '23505', message = 'nombre_en_uso';
  end if;
  v_base := coalesce(
    nullif(trim(both '-' from left(regexp_replace(v_nombre, '[^a-z0-9]+', '-', 'g'), 60)), ''),
    'pilar'
  );
  v_slug := v_base;
  while exists (select 1 from public.categorias where slug = v_slug) loop
    v_sufijo := v_sufijo + 1;
    v_slug := v_base || '-' || v_sufijo;
  end loop;
  insert into public.categorias
    (id, slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa, red, es_capa, creada_por)
  select v_pilar, v_slug, v_borrador.nombre, v_borrador.nombre_corto, v_borrador.descripcion,
         (coalesce(max(c.orden), 0) + 1)::smallint, true, true, v_borrador.red, false, auth.uid()
  from public.categorias c
  where c.es_pilar and c.red = v_borrador.red;
  -- Oldest first (decision 7): each statement sees the stages already written, so a weight lowered today does not
  -- silently carry into a later stage whose value she kept.
  foreach v_desde in array v_etapas loop
    insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
    values (
      v_pilar, v_borrador.red, false, v_desde,
      coalesce(round((p_pesos -> to_char(v_desde, 'YYYY-MM-DD') ->> 'nuevo')::numeric, 2), v_borrador.peso)
    );
    insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
    select c.id, c.red, c.es_capa, v_desde, round((w.value)::numeric, 2)
    from jsonb_each(coalesce(p_pesos -> to_char(v_desde, 'YYYY-MM-DD'), '{}'::jsonb)) w
    join public.categorias c on c.id::text = w.key
    where w.key <> 'nuevo'
      and round((w.value)::numeric, 2) is distinct from (
        select x.peso from public.pilar_pesos x
        where x.pilar_id = c.id and x.desde <= v_desde
        order by x.desde desc
        limit 1
      )
    on conflict (pilar_id, desde) do update set peso = excluded.peso;
  end loop;
  update public.borradores_de_pilar set estado = 'aprobado', pilar_id = v_pilar where id = p_borrador;
  return v_pilar;
end $$;

revoke execute on function public.aprobar_borrador_de_pilar(uuid, jsonb) from public, anon;
grant execute on function public.aprobar_borrador_de_pilar(uuid, jsonb) to authenticated;
