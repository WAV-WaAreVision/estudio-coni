-- The one-off reclassification into the pillars per network (spec 2026-11-04, part 15a, section 3), applied as a lot
-- that can be undone. A lot records what it did: the topics' rows carry its id, each bank idea's pillar before it moved,
-- and the old pillars it retired. Only definer RPCs write these tables; the scripts run them with the service role.
create table public.lotes_de_pilares (
  lote text primary key,
  aplicado_en timestamptz not null default now()
);

create table public.lote_pilares_retirados (
  lote text not null references public.lotes_de_pilares (lote),
  pilar_id uuid not null references public.categorias (id),
  primary key (lote, pilar_id)
);

create table public.ideas_pilar_antes (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  pilar text not null references public.categorias (slug),
  lote text not null references public.lotes_de_pilares (lote),
  primary key (idea_id, lote)
);

alter table public.lotes_de_pilares enable row level security;
alter table public.lote_pilares_retirados enable row level security;
alter table public.ideas_pilar_antes enable row level security;
revoke all on public.lotes_de_pilares, public.lote_pilares_retirados, public.ideas_pilar_antes
  from anon, authenticated, service_role;
grant select on public.lotes_de_pilares, public.lote_pilares_retirados, public.ideas_pilar_antes to service_role;
create trigger auditar after insert or update or delete on public.lotes_de_pilares
  for each row execute function public.registrar_evento();

-- p_filas: {"temas": [{"tema_id": uuid, "pilares": [{"pilar": slug, "fuerza": ...}]}],
--           "ideas": [{"idea_id": uuid, "pilar": slug}]}
-- Order (spec section 3): the topics' rows, then the bank ideas move, then the old pillars retire, so no bank idea is
-- ever left on a retired pillar (`pilarVisible` would throw on it).
create function public.aplicar_lote_de_pilares(p_lote text, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tema jsonb;
  v_tema_id uuid;
  v_idea jsonb;
  v_actual record;
  v_n int;
  v_filas int := 0;
  v_ideas int := 0;
  v_retirados int;
begin
  if p_lote is null or btrim(p_lote) = '' then
    raise exception using errcode = '22023', message = 'lote_vacio';
  end if;
  if exists (select 1 from public.lotes_de_pilares where lote = p_lote) then
    raise exception using errcode = '22023', message = 'lote_ya_aplicado';
  end if;
  insert into public.lotes_de_pilares (lote) values (p_lote);

  for v_tema in select * from jsonb_array_elements(coalesce(p_filas -> 'temas', '[]'::jsonb)) loop
    v_tema_id := (v_tema ->> 'tema_id')::uuid;
    perform 1 from public.temas where id = v_tema_id and fusionado_en is null for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'tema_inexistente', detail = v_tema_id::text;
    end if;
    -- A topic Coni or the ingesta already classified is not overwritten: the proposal lists only topics without rows.
    if exists (select 1 from public.tema_pilares where tema_id = v_tema_id) then
      raise exception using errcode = '22023', message = 'tema_ya_tiene_pilares', detail = v_tema_id::text;
    end if;
    insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen, lote)
    select v_tema_id, r.pilar_id, r.red, r.es_capa, r.fuerza, 'reclasificacion', p_lote
    from public.resolver_filas_de_pilares(coalesce(v_tema -> 'pilares', '[]'::jsonb)) r;
    get diagnostics v_n = row_count;
    v_filas := v_filas + v_n;
  end loop;

  for v_idea in select * from jsonb_array_elements(coalesce(p_filas -> 'ideas', '[]'::jsonb)) loop
    select i.id, i.pilar, i.estado into v_actual
    from public.ideas i where i.id = (v_idea ->> 'idea_id')::uuid for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'idea_inexistente', detail = v_idea ->> 'idea_id';
    end if;
    -- Used and discarded ideas keep their old slug: that is history (spec section 3).
    if v_actual.estado <> 'idea' then
      raise exception using errcode = '22023', message = 'idea_fuera_del_banco', detail = v_actual.id::text;
    end if;
    if not exists (
      select 1 from public.categorias c
      where c.slug = v_idea ->> 'pilar' and c.es_pilar and c.activa and c.red is not null and not c.es_capa
    ) then
      raise exception using errcode = 'P0002', message = 'pilar_desconocido', detail = v_idea ->> 'pilar';
    end if;
    insert into public.ideas_pilar_antes (idea_id, pilar, lote) values (v_actual.id, v_actual.pilar, p_lote);
    update public.ideas set pilar = v_idea ->> 'pilar' where id = v_actual.id;
    v_ideas := v_ideas + 1;
  end loop;

  insert into public.lote_pilares_retirados (lote, pilar_id)
  select p_lote, c.id from public.categorias c where c.es_pilar and c.activa and c.red is null;
  if exists (
    select 1 from public.ideas i
    join public.categorias c on c.slug = i.pilar
    join public.lote_pilares_retirados r on r.pilar_id = c.id and r.lote = p_lote
    where i.estado = 'idea'
  ) then
    raise exception using errcode = '22023', message = 'idea_en_pilar_retirado';
  end if;
  update public.categorias c set activa = false
  from public.lote_pilares_retirados r
  where r.lote = p_lote and r.pilar_id = c.id;
  get diagnostics v_retirados = row_count;

  return jsonb_build_object('filas', v_filas, 'ideas', v_ideas, 'retirados', v_retirados);
end $$;

revoke execute on function public.aplicar_lote_de_pilares(text, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_lote_de_pilares(text, jsonb) to service_role;
