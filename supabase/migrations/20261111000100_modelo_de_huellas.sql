-- Issue 19 (change 17): the embedding model and the similarity thresholds become data, so voyage-4 can be tried in
-- parallel tables, applied in one transaction and reverted within 30 days. Spec 2026-11-09-voyage-4-design.md, plan
-- 2026-11-09-voyage-4.md (decisions 1 to 4 explain what differs from the spec).

-- Dry runs of a model, written by the task `probar-modelo-de-huellas` (lib/modelo/probar.ts).
create table public.pruebas_de_modelo (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (modelo in ('voyage-3.5', 'voyage-4')),
  estado text not null default 'lista' check (estado in ('lista', 'aplicada', 'revertida', 'descartada')),
  umbrales jsonb not null check (umbrales ?& array['tema', 'grupo', 'fusion', 'puente_min', 'puente_max']),
  informe jsonb not null,
  -- The calibration the switch replaced; the revert makes it vigente again.
  version_anterior int,
  creada_en timestamptz not null default now(),
  aplicada_en timestamptz,
  revertida_en timestamptz,
  constraint aplicada_con_fecha check ((estado in ('aplicada', 'revertida')) = (aplicada_en is not null)),
  constraint revertida_con_fecha check ((estado = 'revertida') = (revertida_en is not null))
);

-- One vigente row: the model every embed uses and the thresholds every similarity test reads (all on the mean-cosine
-- scale of docs/superpowers/notas/calibracion-c1.md).
create table public.calibraciones_de_parecido (
  version int primary key check (version > 0),
  modelo text not null check (modelo in ('voyage-3.5', 'voyage-4')),
  tema numeric not null check (tema between 0 and 1),
  grupo numeric not null check (grupo between 0 and 1),
  fusion numeric not null check (fusion between 0 and 1),
  puente_min numeric not null check (puente_min between 0 and 1),
  puente_max numeric not null check (puente_max between 0 and 1),
  vigente boolean not null default false,
  prueba_id uuid references public.pruebas_de_modelo (id) on delete restrict,
  creada_en timestamptz not null default now(),
  motivo text not null,
  constraint puente_ordenado check (puente_min <= puente_max)
);
create unique index calibraciones_una_vigente on public.calibraciones_de_parecido (vigente) where vigente;

insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, vigente, motivo)
values (1, 'voyage-3.5', 0.8, 0.8, 0.8, 0.6, 0.8, true, 'Calibración C1 (docs/superpowers/notas/calibracion-c1.md)');

create function public.modelo_de_huellas_vigente() returns text
language sql stable security definer set search_path = '' as $$
  select modelo from public.calibraciones_de_parecido where vigente
$$;

-- Every vector and centroid says which model made it. Existing ones are voyage-3.5.
alter table public.afirmaciones add column modelo_vector text check (modelo_vector in ('voyage-3.5', 'voyage-4'));
update public.afirmaciones set modelo_vector = 'voyage-3.5' where vector is not null;
alter table public.afirmaciones add constraint vector_con_modelo check ((vector is null) = (modelo_vector is null));

alter table public.temas add column modelo_centroide text check (modelo_centroide in ('voyage-3.5', 'voyage-4'));
update public.temas set modelo_centroide = 'voyage-3.5';
alter table public.temas alter column modelo_centroide set not null;

-- A vector written without a model (the Trigger code deployed before this migration, SQL) takes the vigente one. A
-- vector stamped with another model was embedded before a switch committed: it is dropped, and maintenance embeds the
-- claim again with the vigente model.
create function public.sellar_modelo_de_vector() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actual text := public.modelo_de_huellas_vigente();
begin
  if new.vector is null then
    new.modelo_vector := null;
  elsif new.modelo_vector is null then
    new.modelo_vector := actual;
  elsif new.modelo_vector <> actual then
    new.vector := null;
    new.modelo_vector := null;
  end if;
  return new;
end $$;

create trigger sellar_modelo before insert or update of vector, modelo_vector on public.afirmaciones
  for each row execute function public.sellar_modelo_de_vector();

-- A centroid recomputed in SQL (recalcular_tema, fusionar_par_de_temas) averages the vigente vectors and takes the
-- vigente model. A writer that names another model (TypeScript that read the calibration before a switch) is refused;
-- its run fails and the next one starts over with the new calibration. Not 40001: PostgREST hangs on that code.
create function public.sellar_modelo_de_centroide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actual text := public.modelo_de_huellas_vigente();
begin
  if new.modelo_centroide is null
     or (tg_op = 'UPDATE' and new.modelo_centroide is not distinct from old.modelo_centroide) then
    new.modelo_centroide := actual;
  elsif new.modelo_centroide <> actual then
    raise exception 'modelo_de_huellas_cambio';
  end if;
  return new;
end $$;

create trigger sellar_modelo before insert or update of centroide, modelo_centroide on public.temas
  for each row execute function public.sellar_modelo_de_centroide();

-- Coni's decisions on topics (change 9, #22, writes them); the x3 recalibration will read them. Empty for now. They
-- must outlive the topics and the claim they were about (a merge or a deletion), so the foreign keys null out and the
-- names are copied when the decision is recorded.
create table public.decisiones_de_tema (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fusion_aceptada', 'fusion_rechazada', 'afirmacion_confirmada', 'afirmacion_quitada')),
  tema_id uuid references public.temas (id) on delete set null,
  otro_tema_id uuid references public.temas (id) on delete set null,
  afirmacion_id uuid references public.afirmaciones (id) on delete set null,
  tema_nombre text not null,
  otro_tema_nombre text,
  decidida_en timestamptz not null default now(),
  decidida_por uuid not null default auth.uid(),
  -- Loose on purpose: a deletion nulls an id after the fact. The strict shape is checked when the row is inserted.
  constraint forma_de_la_decision check (
    case
      when tipo in ('fusion_aceptada', 'fusion_rechazada') then afirmacion_id is null
      else otro_tema_id is null and otro_tema_nombre is null
    end
  )
);
create index decisiones_de_tema_tema on public.decisiones_de_tema (tema_id);

create function public.completar_decision_de_tema() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tema_id is null
     or (new.tipo in ('fusion_aceptada', 'fusion_rechazada')) <> (new.otro_tema_id is not null)
     or (new.tipo in ('fusion_aceptada', 'fusion_rechazada')) = (new.afirmacion_id is not null) then
    raise exception using errcode = '23514', message = 'forma_de_la_decision';
  end if;
  new.tema_nombre := (select nombre from public.temas where id = new.tema_id);
  new.otro_tema_nombre := (select nombre from public.temas where id = new.otro_tema_id);
  return new;
end $$;

create trigger completar_decision before insert on public.decisiones_de_tema
  for each row execute function public.completar_decision_de_tema();

-- The vectors a dry run computed for each claim with a vector (centroids are recomputed by the switch).
create table public.huellas_candidatas (
  id bigint generated always as identity primary key,
  prueba_id uuid not null references public.pruebas_de_modelo (id) on delete cascade,
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  modelo text not null check (modelo in ('voyage-3.5', 'voyage-4')),
  vector extensions.vector(1024) not null,
  constraint una_candidata_por_afirmacion unique (prueba_id, afirmacion_id)
);
create index huellas_candidatas_afirmacion on public.huellas_candidatas (afirmacion_id);

-- What was live before a switch, kept 30 days for the revert.
create table public.huellas_anteriores (
  id bigint generated always as identity primary key,
  prueba_id uuid not null references public.pruebas_de_modelo (id) on delete cascade,
  afirmacion_id uuid references public.afirmaciones (id) on delete cascade,
  tema_id uuid references public.temas (id) on delete cascade,
  modelo text not null check (modelo in ('voyage-3.5', 'voyage-4')),
  vector extensions.vector(1024) not null,
  version_calibracion int not null references public.calibraciones_de_parecido (version),
  guardadas_en timestamptz not null default now(),
  constraint de_una_cosa check ((afirmacion_id is null) <> (tema_id is null)),
  constraint una_anterior_por_afirmacion unique (prueba_id, afirmacion_id),
  constraint una_anterior_por_tema unique (prueba_id, tema_id)
);
create index huellas_anteriores_afirmacion on public.huellas_anteriores (afirmacion_id);
create index huellas_anteriores_tema on public.huellas_anteriores (tema_id);

alter table public.pruebas_de_modelo enable row level security;
alter table public.calibraciones_de_parecido enable row level security;
alter table public.decisiones_de_tema enable row level security;
alter table public.huellas_candidatas enable row level security;
alter table public.huellas_anteriores enable row level security;

-- Service role only: no policies, no grants to the app.
revoke all on public.pruebas_de_modelo, public.calibraciones_de_parecido, public.huellas_candidatas,
  public.huellas_anteriores from anon, authenticated;

revoke all on public.decisiones_de_tema from anon, authenticated;
grant select, insert on public.decisiones_de_tema to authenticated;
create policy "coni y wav leen decisiones de tema" on public.decisiones_de_tema for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni decide sobre temas" on public.decisiones_de_tema for insert to authenticated
  with check (public.es_coni() and decidida_por = auth.uid());

revoke execute on function public.modelo_de_huellas_vigente(), public.sellar_modelo_de_vector(),
  public.sellar_modelo_de_centroide(), public.completar_decision_de_tema() from public, anon, authenticated;
grant execute on function public.modelo_de_huellas_vigente() to service_role;
