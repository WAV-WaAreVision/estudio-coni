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
