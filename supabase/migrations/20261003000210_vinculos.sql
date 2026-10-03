-- Links between materials: Claude suggests them, Coni or the maintainer accepts or discards them.
-- One row per unordered pair: the pair is stored with material_a < material_b, so (x, y) and (y, x) are the same link.
create table public.vinculos (
  material_a uuid not null references public.materiales (id) on delete cascade,
  material_b uuid not null references public.materiales (id) on delete cascade,
  tipo text not null check (tipo in ('complementa', 'amplia', 'contradice', 'mismo_concepto', 'ejemplo_de')),
  relevancia smallint not null check (relevancia between 1 and 5),
  estado text not null default 'sugerido' check (estado in ('sugerido', 'aceptado', 'descartado')),
  razon text,
  cita_a text,
  cita_b text,
  decidido_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  decidido_en timestamptz,
  primary key (material_a, material_b),
  check (material_a < material_b)
);

create index vinculos_material_b on public.vinculos (material_b);

alter table public.vinculos enable row level security;
revoke all on public.vinculos from anon, authenticated;
grant select on public.vinculos to authenticated;

create policy "coni y wav leen vinculos" on public.vinculos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create trigger auditar after insert or update or delete on public.vinculos
  for each row execute function public.registrar_evento();

-- Nearest cards by cosine distance. A pair that already has a link in any estado is left out, so a decision (and a
-- discard above all) is never suggested again. Security invoker: only the service role reads the embeddings here.
create function public.materiales_cercanos(p_material uuid, p_limite int default 10)
returns table (material_id uuid, distancia double precision)
language sql stable set search_path = '' as $$
  select e.material_id, (e.vector operator(extensions.<=>) o.vector)::double precision as distancia
  from public.embeddings_ficha o
  join public.embeddings_ficha e on e.material_id <> o.material_id and e.modelo = o.modelo
  where o.material_id = p_material
    and not exists (
      select 1 from public.vinculos v
      where v.material_a = least(o.material_id, e.material_id) and v.material_b = greatest(o.material_id, e.material_id)
    )
  order by distancia, e.material_id
  limit greatest(p_limite, 0)
$$;

revoke execute on function public.materiales_cercanos(uuid, int) from public, anon, authenticated;
grant execute on function public.materiales_cercanos(uuid, int) to service_role;

create function public.aceptar_vinculo(p_a uuid, p_b uuid, p_tipo text default null, p_relevancia int default null)
returns public.vinculos
language plpgsql security definer set search_path = '' as $$
declare
  v_a uuid := least(p_a, p_b);
  v_b uuid := greatest(p_a, p_b);
  v_fila public.vinculos;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception using errcode = '22023', message = 'vinculo_invalido';
  end if;
  select * into v_fila from public.vinculos where material_a = v_a and material_b = v_b for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'vinculo_inexistente';
  end if;
  if v_fila.estado = 'descartado' then
    raise exception using errcode = '22023', message = 'vinculo_descartado';
  end if;
  update public.vinculos
     set estado = 'aceptado',
         tipo = coalesce(p_tipo, tipo),
         relevancia = coalesce(p_relevancia, relevancia),
         decidido_por = auth.uid(),
         decidido_en = now()
   where material_a = v_a and material_b = v_b
  returning * into v_fila;
  return v_fila;
end $$;

create function public.descartar_vinculo(p_a uuid, p_b uuid)
returns public.vinculos
language plpgsql security definer set search_path = '' as $$
declare
  v_a uuid := least(p_a, p_b);
  v_b uuid := greatest(p_a, p_b);
  v_fila public.vinculos;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception using errcode = '22023', message = 'vinculo_invalido';
  end if;
  update public.vinculos
     set estado = 'descartado', decidido_por = auth.uid(), decidido_en = now()
   where material_a = v_a and material_b = v_b
  returning * into v_fila;
  if not found then
    raise exception using errcode = 'P0002', message = 'vinculo_inexistente';
  end if;
  return v_fila;
end $$;

create function public.crear_vinculo(p_a uuid, p_b uuid, p_tipo text, p_relevancia int, p_razon text)
returns public.vinculos
language plpgsql security definer set search_path = '' as $$
declare
  v_fila public.vinculos;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception using errcode = '22023', message = 'vinculo_invalido';
  end if;
  insert into public.vinculos (material_a, material_b, tipo, relevancia, estado, razon, decidido_por, decidido_en)
  values (least(p_a, p_b), greatest(p_a, p_b), p_tipo, p_relevancia, 'aceptado', p_razon, auth.uid(), now())
  on conflict do nothing
  returning * into v_fila;
  if not found then
    raise exception using errcode = '22023', message = 'vinculo_existente';
  end if;
  return v_fila;
end $$;

revoke execute on function public.aceptar_vinculo(uuid, uuid, text, int), public.descartar_vinculo(uuid, uuid),
  public.crear_vinculo(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.aceptar_vinculo(uuid, uuid, text, int), public.descartar_vinculo(uuid, uuid),
  public.crear_vinculo(uuid, uuid, text, int, text) to authenticated;
