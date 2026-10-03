-- Theories: Claude weaves two to eight cards into a thesis. The web asks for one (pedir_teoria), a Trigger task
-- writes the synthesis with the service role, and Coni or the maintainer edit and save it (guardar_teoria).
create table public.teorias (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  tesis text,
  argumentos jsonb,
  contradicciones jsonb,
  categoria_id uuid references public.categorias (id) on delete set null,
  estado text not null default 'sintetizando' check (estado in ('sintetizando', 'borrador', 'guardada', 'fallida')),
  motivo_fallo text,
  creada_por uuid default auth.uid() references auth.users (id),
  creada_en timestamptz not null default now(),
  editada_en timestamptz,
  constraint fallida_con_motivo check (estado <> 'fallida' or motivo_fallo is not null)
);
create index teorias_categoria on public.teorias (categoria_id);
create index teorias_creada_por on public.teorias (creada_por);

create table public.teoria_fuentes (
  teoria_id uuid not null references public.teorias (id) on delete cascade,
  material_id uuid not null references public.materiales (id) on delete cascade,
  primary key (teoria_id, material_id)
);
create index teoria_fuentes_material on public.teoria_fuentes (material_id);

alter table public.teorias enable row level security;
alter table public.teoria_fuentes enable row level security;

-- Members only read and delete; every write goes through the functions below or the service role.
revoke all on public.teorias, public.teoria_fuentes from anon, authenticated;
grant select, delete on public.teorias to authenticated;
grant select on public.teoria_fuentes to authenticated;

create policy "coni y wav leen teorias" on public.teorias for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni o quien pidio borra teorias" on public.teorias for delete to authenticated
  using (public.es_coni() or (public.es_mantenedor() and creada_por = auth.uid()));
create policy "coni y wav leen fuentes de teorias" on public.teoria_fuentes for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create trigger auditar after insert or update or delete on public.teorias
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.teoria_fuentes
  for each row execute function public.registrar_evento();

create function public.pedir_teoria(p_materiales uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid := gen_random_uuid();
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_ids from unnest(p_materiales) as m where m is not null;
  if p_materiales is null
     or cardinality(v_ids) <> cardinality(p_materiales)
     or cardinality(v_ids) not between 2 and 8
     or (
       select count(*) from public.materiales m
       join public.fichas f on f.material_id = m.id
       where m.id = any (v_ids) and m.estado = 'listo'
     ) <> cardinality(v_ids) then
    raise exception using errcode = '22023', message = 'teoria_fuentes_invalidas';
  end if;
  insert into public.teorias (id) values (v_id);
  insert into public.teoria_fuentes (teoria_id, material_id) select v_id, unnest(v_ids);
  return v_id;
end $$;

create function public.guardar_teoria(
  p_id uuid,
  p_titulo text,
  p_tesis text,
  p_argumentos jsonb,
  p_contradicciones jsonb,
  p_categoria uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  select estado into v_estado from public.teorias where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'teoria_inexistente';
  end if;
  if v_estado not in ('borrador', 'guardada') then
    raise exception using errcode = '22023', message = 'teoria_no_editable';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' or btrim(coalesce(p_tesis, '')) = '' then
    raise exception using errcode = '22023', message = 'teoria_incompleta';
  end if;
  update public.teorias
     set titulo = btrim(p_titulo),
         tesis = btrim(p_tesis),
         argumentos = p_argumentos,
         contradicciones = p_contradicciones,
         categoria_id = p_categoria,
         estado = 'guardada',
         editada_en = now()
   where id = p_id;
end $$;

-- Trigger.dev could not be started: the theory would be sintetizando forever. Only a theory still waiting is touched.
create function public.marcar_teoria_disparo_fallido(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.teorias
     set estado = 'fallida', motivo_fallo = 'No pude iniciar la síntesis. Reintenta.'
   where id = p_id and estado = 'sintetizando';
end $$;

create function public.reintentar_teoria(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.teorias set estado = 'sintetizando', motivo_fallo = null where id = p_id and estado = 'fallida';
  if not found then
    raise exception using errcode = '22023', message = 'teoria_no_reintentable';
  end if;
end $$;

revoke execute on function
  public.pedir_teoria(uuid[]),
  public.guardar_teoria(uuid, text, text, jsonb, jsonb, uuid),
  public.marcar_teoria_disparo_fallido(uuid),
  public.reintentar_teoria(uuid)
  from public, anon;
grant execute on function
  public.pedir_teoria(uuid[]),
  public.guardar_teoria(uuid, text, text, jsonb, jsonb, uuid),
  public.marcar_teoria_disparo_fallido(uuid),
  public.reintentar_teoria(uuid)
  to authenticated;
