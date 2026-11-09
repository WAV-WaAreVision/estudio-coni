-- Issue 22 (change 9): merges get a log with an exact undo, Claude's verdicts wait for Coni when they are delicate,
-- subtopics are stored and rejections keep their reason. Spec docs/superpowers/specs/2026-11-09-fusiones-de-temas-design.md,
-- plan docs/superpowers/plans/2026-11-09-fusiones-de-temas.md (its decisions explain what differs from the spec).

create table public.fusiones (
  id uuid primary key default gen_random_uuid(),
  ganador_id uuid not null references public.temas (id) on delete cascade,
  perdedor_id uuid not null references public.temas (id) on delete cascade,
  -- vencida: a proposal about a topic another merge took away (fusionar_par_de_temas closes it).
  estado text not null default 'propuesta'
    check (estado in ('propuesta', 'aplicada', 'deshecha', 'rechazada', 'vencida')),
  origen text not null check (origen in ('claude', 'coni')),
  veredicto text check (veredicto in ('mismo', 'parte_de', 'distintos')),
  -- What Coni answered (decidir_fusion, unir_temas_a_mano); `veredicto` stays what Claude said.
  veredicto_coni text check (veredicto_coni in ('mismo', 'parte_de', 'distintos')),
  seguro boolean,
  razon text,
  parecido numeric,
  modelo text check (modelo in ('voyage-3.5', 'voyage-4')),
  -- sha256 of the merging guide (VERSION_DE_FUSIONES); null for merges logged by older code.
  version_prompt text,
  delicada boolean not null default false,
  motivo_delicada text,
  creada_en timestamptz not null default now(),
  decidida_en timestamptz,
  aplicada_en timestamptz,
  deshecha_en timestamptz,
  -- The undo's snapshot, written by fusionar_par_de_temas before it changes anything.
  pilares_perdedor jsonb,
  pilares_ganador jsonb,
  -- The winner's rows right after the merge: the undo refuses when Coni changed them since (decision 3 of Federico, 2026-11-09).
  pilares_ganador_despues jsonb,
  alias_agregados text[],
  encadenados uuid[],
  constraint temas_distintos check (ganador_id <> perdedor_id),
  constraint aplicada_con_fecha check ((estado in ('aplicada', 'deshecha')) = (aplicada_en is not null)),
  constraint deshecha_con_fecha check ((estado = 'deshecha') = (deshecha_en is not null)),
  constraint aplicada_con_foto check (
    aplicada_en is null
    or (pilares_perdedor is not null and pilares_ganador is not null and pilares_ganador_despues is not null
        and alias_agregados is not null and encadenados is not null)
  )
);
create unique index fusiones_una_propuesta_por_par on public.fusiones
  (least(ganador_id, perdedor_id), greatest(ganador_id, perdedor_id)) where estado = 'propuesta';
create index fusiones_ganador on public.fusiones (ganador_id);
create index fusiones_perdedor on public.fusiones (perdedor_id);
create index fusiones_por_estado on public.fusiones (estado, creada_en desc);

-- One row per claim a merge moved, so the undo puts each one back where it came from.
create table public.fusiones_afirmaciones (
  fusion_id uuid not null references public.fusiones (id) on delete cascade,
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  tema_origen uuid not null references public.temas (id) on delete cascade,
  primary key (fusion_id, afirmacion_id)
);
create index fusiones_afirmaciones_afirmacion on public.fusiones_afirmaciones (afirmacion_id);

-- «Uno es parte del otro»: stored now, shown as a line on the topic page until change 15 uses it.
create table public.temas_subtemas (
  tema_id uuid not null references public.temas (id) on delete cascade,
  padre_id uuid not null references public.temas (id) on delete cascade,
  origen text not null check (origen in ('claude', 'coni')),
  creada_en timestamptz not null default now(),
  primary key (tema_id, padre_id),
  constraint sin_si_mismo check (tema_id <> padre_id)
);
create unique index temas_subtemas_un_par on public.temas_subtemas
  (least(tema_id, padre_id), greatest(tema_id, padre_id));
create index temas_subtemas_padre on public.temas_subtemas (padre_id);

-- Who said no and why. Claude's «no» is asked again when a topic grew 30 % or the model changed (temas_parecidos);
-- Coni's never. Rows written by the Trigger code deployed before this migration carry no counts and no model.
alter table public.temas_fusion_rechazada
  add column origen text not null default 'claude' check (origen in ('claude', 'coni')),
  add column razon text,
  add column afirmaciones_a int check (afirmaciones_a >= 0),
  add column afirmaciones_b int check (afirmaciones_b >= 0),
  add column modelo text check (modelo in ('voyage-3.5', 'voyage-4'));

create function public.afirmaciones_vivas(p_tema uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.afirmaciones where tema_id = p_tema and not excluida
$$;
revoke execute on function public.afirmaciones_vivas(uuid) from public, anon, authenticated;
grant execute on function public.afirmaciones_vivas(uuid) to service_role;

alter table public.fusiones enable row level security;
alter table public.fusiones_afirmaciones enable row level security;
alter table public.temas_subtemas enable row level security;
revoke all on public.fusiones, public.fusiones_afirmaciones, public.temas_subtemas from anon, authenticated, service_role;
-- The nightly run inserts proposals and subtopics and completes the verdict of a merge it applied; every other write
-- goes through the definer functions of 20261112000200 to 20261112000500. It can insert only the columns of a proposal:
-- never a state, a decision date or a snapshot, so it cannot log a merge that never happened.
grant select on public.fusiones, public.temas_subtemas to service_role;
grant insert on public.temas_subtemas to service_role;
grant insert (ganador_id, perdedor_id, origen, veredicto, seguro, razon, parecido, modelo, version_prompt, delicada, motivo_delicada)
  on public.fusiones to service_role;
grant update (seguro, razon, parecido, version_prompt) on public.fusiones to service_role;
grant select on public.fusiones_afirmaciones to service_role;
grant select on public.fusiones, public.temas_subtemas to authenticated;
create policy "coni y wav leen fusiones" on public.fusiones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav leen subtemas" on public.temas_subtemas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

-- Claude's rejection of a pair it asked again is an update of the same row.
grant update on public.temas_fusion_rechazada to service_role;
grant select on public.temas_fusion_rechazada to authenticated;
create policy "coni y wav leen pares rechazados" on public.temas_fusion_rechazada for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
