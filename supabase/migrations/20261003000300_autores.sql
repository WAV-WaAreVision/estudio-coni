create table public.autores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (public.unaccent_inmutable(lower(btrim(nombre)))) stored unique,
  alias text[] not null default '{}',
  credencial text,
  tipo text not null check (tipo in ('coni', 'persona', 'cuenta', 'institucion')),
  creado_por uuid default auth.uid() references auth.users (id),
  creado_en timestamptz not null default now()
);

insert into public.autores (nombre, tipo) values ('Constanza del Rosario', 'coni');

alter table public.autores enable row level security;
revoke all on public.autores from anon, authenticated;
grant select on public.autores to authenticated;
create policy "coni y wav leen autores" on public.autores for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

alter table public.materiales
  add column autor_id uuid references public.autores (id) on delete restrict,
  add column rol text not null default 'referente'
    check (rol in ('voz_propia', 'referente', 'evidencia', 'estrategia'));
alter table public.materiales alter column categoria_id drop not null;
create index materiales_autor on public.materiales (autor_id);

-- backfill:start
insert into public.autores (nombre, tipo)
select distinct on (public.unaccent_inmutable(lower(btrim(autor)))) btrim(autor), 'persona'
from public.materiales
where btrim(coalesce(autor, '')) <> ''
order by public.unaccent_inmutable(lower(btrim(autor))), creado_en, btrim(autor)
on conflict (nombre_normalizado) do nothing;

update public.materiales m set autor_id = a.id
from public.autores a
where btrim(coalesce(m.autor, '')) <> ''
  and a.nombre_normalizado = public.unaccent_inmutable(lower(btrim(m.autor)));

insert into public.autores (nombre, tipo)
select 'Sin autor', 'persona'
where exists (select 1 from public.materiales where autor_id is null)
on conflict (nombre_normalizado) do nothing;

update public.materiales set autor_id = (select id from public.autores where nombre_normalizado = 'sin autor')
where autor_id is null;

alter table public.materiales alter column autor_id set not null;
-- backfill:end

grant insert (autor_id, rol) on public.materiales to authenticated;
grant update (autor_id, rol) on public.materiales to authenticated;

create function public.crear_autor(p_nombre text, p_credencial text, p_tipo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalizado text := public.unaccent_inmutable(lower(btrim(coalesce(p_nombre, ''))));
  existente uuid;
  nuevo uuid := gen_random_uuid();
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if normalizado = '' then
    raise exception using errcode = '22023', message = 'autor_vacio';
  end if;
  select id into existente from public.autores
  where nombre_normalizado = normalizado
     or exists (
       select 1 from unnest(alias) a
       where public.unaccent_inmutable(lower(btrim(a))) = normalizado
     )
  limit 1;
  if existente is not null then
    return existente;
  end if;
  -- Atomic: a concurrent call with the same name conflicts here instead of raising.
  insert into public.autores (id, nombre, credencial, tipo)
  values (nuevo, btrim(p_nombre), nullif(btrim(coalesce(p_credencial, '')), ''), p_tipo)
  on conflict (nombre_normalizado) do nothing
  returning id into existente;
  if existente is null then
    select id into existente from public.autores where nombre_normalizado = normalizado;
  end if;
  return existente;
end $$;

create function public.editar_autor(p_id uuid, p_nombre text, p_credencial text, p_alias text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  normalizado text := public.unaccent_inmutable(lower(btrim(coalesce(p_nombre, ''))));
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if normalizado = '' then
    raise exception using errcode = '22023', message = 'autor_vacio';
  end if;
  if exists (select 1 from public.autores where nombre_normalizado = normalizado and id <> p_id) then
    raise exception using errcode = '23505', message = 'autor_repetido';
  end if;
  update public.autores
  set nombre = btrim(p_nombre),
      credencial = nullif(btrim(coalesce(p_credencial, '')), ''),
      alias = coalesce(
        (select array_agg(btrim(a) order by ord) from unnest(p_alias) with ordinality as t(a, ord)
         where btrim(coalesce(a, '')) <> ''),
        '{}')
  where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'autor_inexistente';
  end if;
end $$;

create function public.fusionar_autores(p_origen uuid, p_destino uuid) returns void
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

revoke execute on function public.crear_autor(text, text, text), public.editar_autor(uuid, text, text, text[]),
  public.fusionar_autores(uuid, uuid) from public, anon;
grant execute on function public.crear_autor(text, text, text), public.editar_autor(uuid, text, text, text[]),
  public.fusionar_autores(uuid, uuid) to authenticated;

create trigger auditar after insert or update or delete on public.autores
  for each row execute function public.registrar_evento();
