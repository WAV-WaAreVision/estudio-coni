-- The pillars of a topic are written in one place (spec 2026-11-04, part 15a, sections 2 and 5). The rows arrive as
-- [{"pilar": <slug>, "fuerza": "alta" | "media" | "baja" | null}]: the main pillar of a network is its only `alta`,
-- secondaries are `media` or `baja` and need a main pillar in their network, a layer has no strength.
create function public.resolver_filas_de_pilares(p_filas jsonb)
returns table (pilar_id uuid, red text, es_capa boolean, fuerza text)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  v_fuerza_invalida boolean;
  v_repetido boolean;
  v_dos_principales boolean;
  v_sin_principal boolean;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_filas) f where jsonb_typeof(f) <> 'object') then
    raise exception using errcode = '22023', message = 'filas_invalidas';
  end if;
  -- Only an active pillar of a network: the five of 2026-10-17 have none and are never a topic's pillar.
  if exists (
    select 1 from jsonb_array_elements(p_filas) f
    where not exists (
      select 1 from public.categorias c
      where c.slug = f ->> 'pilar' and c.es_pilar and c.activa and c.red is not null
    )
  ) then
    raise exception using errcode = 'P0002', message = 'pilar_desconocido';
  end if;
  with filas as (
    select c.id, c.red, c.es_capa, f ->> 'fuerza' as fuerza
    from jsonb_array_elements(p_filas) f
    join public.categorias c on c.slug = f ->> 'pilar'
  )
  select
    exists (
      select 1 from filas x
      where (x.es_capa and x.fuerza is not null)
         or (not x.es_capa and (x.fuerza is null or x.fuerza not in ('alta', 'media', 'baja')))
    ),
    exists (select 1 from filas x group by x.id having count(*) > 1),
    exists (select 1 from filas x where x.fuerza = 'alta' group by x.red having count(*) > 1),
    exists (
      select 1 from filas s
      where s.fuerza in ('media', 'baja')
        and not exists (select 1 from filas p where p.red = s.red and p.fuerza = 'alta')
    )
  into v_fuerza_invalida, v_repetido, v_dos_principales, v_sin_principal;
  if v_fuerza_invalida then
    raise exception using errcode = '22023', message = 'fuerza_invalida';
  end if;
  if v_repetido then
    raise exception using errcode = '22023', message = 'pilar_repetido';
  end if;
  if v_dos_principales then
    raise exception using errcode = '22023', message = 'dos_principales';
  end if;
  if v_sin_principal then
    raise exception using errcode = '22023', message = 'secundario_sin_principal';
  end if;
  return query
    select c.id, c.red, c.es_capa, f ->> 'fuerza'
    from jsonb_array_elements(p_filas) f
    join public.categorias c on c.slug = f ->> 'pilar';
end $$;

-- Internal: only the definer functions below (and the lot's, 20261104000210) call it.
revoke execute on function public.resolver_filas_de_pilares(jsonb) from public, anon, authenticated, service_role;

-- "Cambiar pilares" on a topic's page (spec section 5): Coni replaces every row of the topic with hers. WAV is refused
-- from the app (change 30).
create function public.cambiar_pilares_de_tema(p_tema uuid, p_filas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  perform 1 from public.temas where id = p_tema and fusionado_en is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'tema_inexistente';
  end if;
  delete from public.tema_pilares where tema_id = p_tema;
  insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
  select p_tema, r.pilar_id, r.red, r.es_capa, r.fuerza, 'coni'
  from public.resolver_filas_de_pilares(p_filas) r;
end $$;

revoke execute on function public.cambiar_pilares_de_tema(uuid, jsonb) from public, anon;
grant execute on function public.cambiar_pilares_de_tema(uuid, jsonb) to authenticated;

-- A topic the ingesta just created gets the pillars Claude named (spec section 4). A topic that already has rows (a
-- name that joined an existing topic, Coni's choice, the lot) keeps them: it returns 0.
create function public.pilares_automaticos_de_tema(p_tema uuid, p_filas jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_filas int;
begin
  perform 1 from public.temas where id = p_tema and fusionado_en is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'tema_inexistente';
  end if;
  if exists (select 1 from public.tema_pilares where tema_id = p_tema) then
    return 0;
  end if;
  insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
  select p_tema, r.pilar_id, r.red, r.es_capa, r.fuerza, 'automatico'
  from public.resolver_filas_de_pilares(p_filas) r;
  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

revoke execute on function public.pilares_automaticos_de_tema(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pilares_automaticos_de_tema(uuid, jsonb) to service_role;
