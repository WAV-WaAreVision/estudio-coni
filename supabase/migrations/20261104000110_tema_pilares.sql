-- A topic's pillars (spec 2026-11-04, part 15a, section 2). Coni: one main pillar per network, the only one whose list
-- shows the topic; optional secondaries the engine and the Taller use ("también toca"); the TDAH layer apart. A topic
-- that fits no pillar of a network has no main pillar there. `temas.categoria_id` stays as it is.
create table public.tema_pilares (
  tema_id uuid not null references public.temas (id) on delete cascade,
  pilar_id uuid not null,
  red text not null,
  es_capa boolean not null,
  fuerza text check (fuerza in ('alta', 'media', 'baja')),
  origen text not null check (origen in ('reclasificacion', 'automatico', 'coni')),
  lote text,
  creado_en timestamptz not null default now(),
  primary key (tema_id, pilar_id),
  -- A pillar's network and layer flag cannot change while topics use it.
  constraint tema_pilares_pilar foreign key (pilar_id, red, es_capa)
    references public.categorias (id, red, es_capa),
  constraint fuerza_segun_capa check ((es_capa and fuerza is null) or (not es_capa and fuerza is not null)),
  -- The undo of a lot deletes its rows by `lote`.
  constraint lote_de_reclasificacion check ((origen = 'reclasificacion') = (lote is not null))
);

-- The main pillar is the only `alta` of a topic in a network.
create unique index tema_pilares_un_principal on public.tema_pilares (tema_id, red) where fuerza = 'alta' and not es_capa;
create index tema_pilares_pilar on public.tema_pilares (pilar_id);
create index tema_pilares_lote on public.tema_pilares (lote) where lote is not null;

alter table public.tema_pilares enable row level security;
-- Writes go through definer RPCs only (20261104000200, 20261104000210, 20261104000230).
revoke all on public.tema_pilares from anon, authenticated, service_role;
grant select on public.tema_pilares to authenticated, service_role;
create policy "coni y wav leen pilares de temas" on public.tema_pilares for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.tema_pilares
  for each row execute function public.registrar_evento();
