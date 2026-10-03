-- Weekly idea engine (C2): where an idea came from, what the engine writes about it, and the run that made it.

-- ideas: the 4 rows that exist today were imported, so the column is added with that default and then flipped to the
-- default of new rows, which are proposals Coni asked Claude for.
alter table public.ideas
  add column origen text not null default 'importada'
    check (origen in ('importada', 'propuesta', 'propia', 'motor')),
  add column teoria_id uuid references public.teorias (id) on delete set null,
  add column semana date,
  add column motivo_descarte text
    check (motivo_descarte in ('no_me_representa', 'repetida', 'debil', 'otro'));
alter table public.ideas alter column origen set default 'propuesta';
create index ideas_teoria on public.ideas (teoria_id);

alter table public.ideas drop constraint ideas_estado_check;
alter table public.ideas
  add constraint ideas_estado_check check (estado in ('idea', 'usada', 'descartada', 'archivada'));

alter table public.teorias
  add column origen text not null default 'manual' check (origen in ('manual', 'motor')),
  add column semana date,
  add column temas uuid[] not null default '{}',
  add column puntaje numeric,
  add column componentes jsonb,
  add column nivel_evidencia text check (nivel_evidencia in ('alto', 'medio', 'debil')),
  add column advertencias jsonb not null default '[]',
  add column por_que text;

alter table public.teorias drop constraint teorias_estado_check;
alter table public.teorias
  add constraint teorias_estado_check
  check (estado in ('sintetizando', 'borrador', 'guardada', 'fallida', 'descartada_por_motor'));

-- The claims that back a theory, with what each one contributes. Only the engine writes them.
create table public.teoria_afirmaciones (
  teoria_id uuid not null references public.teorias (id) on delete cascade,
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  aporte text not null,
  primary key (teoria_id, afirmacion_id)
);
create index teoria_afirmaciones_afirmacion on public.teoria_afirmaciones (afirmacion_id);

alter table public.teoria_afirmaciones enable row level security;
revoke all on public.teoria_afirmaciones from anon, authenticated;
grant select on public.teoria_afirmaciones to authenticated;
create policy "coni y wav leen afirmaciones de teorias" on public.teoria_afirmaciones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create table public.motor_corridas (
  id uuid primary key default gen_random_uuid(),
  semana date not null unique,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'lista', 'fallida')),
  resumen jsonb not null default '{}',
  costo_usd numeric not null default 0,
  motivo_fallo text,
  creada_en timestamptz not null default now(),
  terminada_en timestamptz
);

alter table public.motor_corridas enable row level security;
revoke all on public.motor_corridas from anon, authenticated;
grant select on public.motor_corridas to authenticated;
create policy "coni y wav leen corridas del motor" on public.motor_corridas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create trigger auditar after insert or update or delete on public.motor_corridas
  for each row execute function public.registrar_evento();

alter table public.ajustes
  add column ideas_por_semana smallint not null default 10 check (ideas_por_semana between 1 and 30);

-- "Descartar" with a reason; the reasons feed the next week's scores. Only an idea still in the bank can go.
create function public.descartar_idea(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_motivo is null or p_motivo not in ('no_me_representa', 'repetida', 'debil', 'otro') then
    raise exception using errcode = '22023', message = 'motivo_invalido';
  end if;
  update public.ideas
     set estado = 'descartada', motivo_descarte = p_motivo, fijada_en = null
   where id = p_id and estado = 'idea';
  if not found then
    raise exception using errcode = '22023', message = 'no_descartable';
  end if;
end $$;

-- Engine ideas nobody pinned or used within the window leave the bank.
create function public.archivar_ideas_del_motor(p_semanas int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.ideas
     set estado = 'archivada'
   where origen = 'motor'
     and estado = 'idea'
     and fijada_en is null
     and semana < current_date - p_semanas * 7;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.descartar_idea(uuid, text), public.archivar_ideas_del_motor(int)
  from public, anon, authenticated;
grant execute on function public.descartar_idea(uuid, text) to authenticated;
grant execute on function public.archivar_ideas_del_motor(int) to service_role;
