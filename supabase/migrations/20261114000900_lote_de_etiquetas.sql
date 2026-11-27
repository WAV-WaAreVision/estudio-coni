-- Change 6c-2: a weekly batch of up to five doubtful tags for Coni (spec 2026-11-26-etiquetas-6c2-design.md). Adds the
-- mark's row to 6c-1's log, two tables for the batch and the functions that build and read it. No row changes.

-- Closes 6c-1's known limit (two marks of the same field and network). No foreign key on purpose: a `quita` row keeps
-- the id of the mark it removed, and 6c-3 joins the log to the batch items by it. Existing rows stay null.
alter table public.correcciones_de_etiqueta add column marca_id uuid;

-- One batch per week: `semana` is the Monday in America/Santiago. Built the first time Coni reads it that week.
create table public.lotes_de_etiquetas (
  id uuid primary key default gen_random_uuid(),
  semana date not null unique,
  creado_en timestamptz not null default now()
);

create table public.lote_de_etiquetas_items (
  lote_id uuid not null references public.lotes_de_etiquetas (id) on delete cascade,
  posicion smallint not null check (posicion between 1 and 5),
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  campo text not null check (campo in (
    'tipo', 'evidencia', 'problema', 'solucion', 'emocion', 'publico', 'dato', 'caso', 'tipo_de_gancho'
  )),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  -- A mark item whose mark was removed keeps its row with a null id: the item is done.
  marca_id uuid references public.afirmacion_marcas (id) on delete set null,
  motivo text not null check (motivo in ('sin_clasificar', 'otro', 'gancho', 'certeza_baja')),
  primary key (lote_id, posicion),
  -- One item per claim per batch, so the five cards vary.
  unique (lote_id, afirmacion_id)
);
create index lote_de_etiquetas_items_afirmacion on public.lote_de_etiquetas_items (afirmacion_id);
create index lote_de_etiquetas_items_marca on public.lote_de_etiquetas_items (marca_id);

alter table public.lotes_de_etiquetas enable row level security;
alter table public.lote_de_etiquetas_items enable row level security;
revoke all on public.lotes_de_etiquetas, public.lote_de_etiquetas_items from anon, authenticated;
grant select on public.lotes_de_etiquetas, public.lote_de_etiquetas_items to authenticated;
grant all on public.lotes_de_etiquetas, public.lote_de_etiquetas_items to service_role;
create policy "coni y wav leen lotes de etiquetas" on public.lotes_de_etiquetas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav leen items de lotes de etiquetas" on public.lote_de_etiquetas_items
  for select to authenticated using (public.es_coni() or public.es_mantenedor());

-- FUNCTIONS. All `create or replace`: a fix during development re-runs this part alone (see the plan), never a reset.

-- 20261114000800's corregir_etiqueta, now writing the mark's row (updated or added) to the log.
create or replace function public.corregir_etiqueta(
  p_afirmacion uuid, p_campo text, p_red text, p_valor text,
  p_frase text default null, p_por_que text default null, p_marca_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.afirmaciones;
  m public.afirmacion_marcas;
  g public.ganchos;
  v_lista text := public.etiqueta_lista_de_campo(p_campo);
  v_version integer;
  v_valor text := nullif(btrim(p_valor), '');
  v_frase text := nullif(btrim(p_frase), '');
  v_por_que text := nullif(btrim(p_por_que), '');
  v_antes text;
  v_accion text;
  v_marca_id uuid;
begin
  perform public.etiqueta_exigir(p_campo, p_red);
  a := public.etiqueta_afirmacion(p_afirmacion);

  if p_campo in ('problema', 'solucion', 'emocion', 'publico', 'dato', 'caso') then
    if a.etiquetas_antiguas then
      raise exception using errcode = '22023', message = 'afirmacion_antigua';
    end if;
    m := public.etiqueta_marca(a.id, p_campo, p_red, p_marca_id, true);
    if p_campo in ('dato', 'caso') then
      -- No list: only the phrase changes. An added one takes the short label sent, or its phrase.
      if v_frase is null then
        raise exception using errcode = '22023', message = 'falta_frase';
      end if;
      v_valor := coalesce(m.valor, v_valor, v_frase);
      v_version := null;
      v_por_que := null;
    else
      v_version := public.etiqueta_version_vigente(v_lista, p_red);
      if v_valor is null or not (
        public.etiqueta_en_lista(v_version, v_valor) or (v_valor = 'otro' and v_lista in ('dolor', 'publico'))
      ) then
        raise exception using errcode = '22023', message = 'valor_fuera_de_lista';
      end if;
      if v_valor in ('otro', 'otra') and v_por_que is null then
        raise exception using errcode = '22023', message = 'falta_por_que';
      end if;
      if v_valor not in ('otro', 'otra') then
        v_por_que := null;
      end if;
    end if;

    if m.id is null then
      insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, por_que, version_id, origen)
      values (a.id, p_campo, p_red, v_valor, v_frase, 'alta', v_por_que, v_version, 'coni')
      returning id into v_marca_id;
      v_accion := 'agrega';
    else
      v_marca_id := m.id;
      v_accion := case
        when m.valor = v_valor and m.frase is not distinct from v_frase and m.por_que is not distinct from v_por_que
          then 'confirma'
        else 'corrige'
      end;
      update public.afirmacion_marcas
      set valor = v_valor, frase = v_frase, por_que = v_por_que, certeza = 'alta', origen = 'coni',
          version_id = v_version
      where id = m.id;
    end if;
    insert into public.correcciones_de_etiqueta
      (afirmacion_id, campo, red, accion, antes, despues, frase_antes, frase_despues, por_que, certeza_antes, version_id,
       marca_id)
    values (
      a.id, p_campo, p_red, v_accion, m.valor, v_valor,
      case when m.frase is distinct from v_frase then m.frase end,
      case when m.frase is distinct from v_frase then v_frase end,
      v_por_que, m.certeza, v_version, v_marca_id
    );

  elsif p_campo = 'tipo_de_gancho' then
    select * into g from public.ganchos where afirmacion_id = a.id for update;
    if g.id is null then
      raise exception using errcode = 'P0002', message = 'sin_gancho';
    end if;
    v_version := public.etiqueta_version_vigente('gancho', 'todas');
    if v_valor is null or not (v_valor = 'ninguno' or public.etiqueta_en_lista(v_version, v_valor)) then
      raise exception using errcode = '22023', message = 'valor_fuera_de_lista';
    end if;
    v_accion := case when g.tipo = v_valor then 'confirma' else 'corrige' end;
    update public.ganchos set tipo = v_valor, certeza = 'alta', origen = 'coni', version_id = v_version
    where id = g.id;
    insert into public.correcciones_de_etiqueta
      (afirmacion_id, campo, red, accion, antes, despues, certeza_antes, version_id)
    values (a.id, p_campo, p_red, v_accion, g.tipo, v_valor, g.certeza, v_version);

  else
    v_version := public.etiqueta_version_vigente(v_lista, 'todas');
    if v_valor is null or not public.etiqueta_en_lista(v_version, v_valor) then
      raise exception using errcode = '22023', message = 'valor_fuera_de_lista';
    end if;
    v_antes := case when p_campo = 'tipo' then a.tipo else a.evidencia end;
    if p_campo = 'tipo' then
      update public.afirmaciones set tipo = v_valor where id = a.id;
    else
      update public.afirmaciones set evidencia = v_valor where id = a.id;
    end if;
    insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues, version_id)
    values (a.id, p_campo, p_red, case when v_antes = v_valor then 'confirma' else 'corrige' end, v_antes, v_valor,
            v_version);
  end if;
end
$$;

-- 20261114000800's confirmar_etiqueta, now writing the mark's row to the log.
create or replace function public.confirmar_etiqueta(
  p_afirmacion uuid, p_campo text, p_red text, p_marca_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.afirmaciones;
  m public.afirmacion_marcas;
  g public.ganchos;
  v_antes text;
  v_version integer;
begin
  perform public.etiqueta_exigir(p_campo, p_red);
  a := public.etiqueta_afirmacion(p_afirmacion);

  if p_campo in ('problema', 'solucion', 'emocion', 'publico', 'dato', 'caso') then
    if a.etiquetas_antiguas then
      raise exception using errcode = '22023', message = 'afirmacion_antigua';
    end if;
    m := public.etiqueta_marca(a.id, p_campo, p_red, p_marca_id, false);
    update public.afirmacion_marcas set certeza = 'alta', origen = 'coni' where id = m.id;
    insert into public.correcciones_de_etiqueta
      (afirmacion_id, campo, red, accion, antes, despues, por_que, certeza_antes, version_id, marca_id)
    values (a.id, p_campo, p_red, 'confirma', m.valor, m.valor, m.por_que, m.certeza, m.version_id, m.id);

  elsif p_campo = 'tipo_de_gancho' then
    select * into g from public.ganchos where afirmacion_id = a.id for update;
    if g.id is null then
      raise exception using errcode = 'P0002', message = 'sin_gancho';
    end if;
    update public.ganchos set certeza = 'alta', origen = 'coni' where id = g.id;
    insert into public.correcciones_de_etiqueta
      (afirmacion_id, campo, red, accion, antes, despues, certeza_antes, version_id)
    values (a.id, p_campo, p_red, 'confirma', g.tipo, g.tipo, g.certeza, g.version_id);

  else
    -- Only a value of the vigente list is confirmed: not sin_clasificar, not one the list retired or dropped.
    v_antes := case when p_campo = 'tipo' then a.tipo else a.evidencia end;
    v_version := public.etiqueta_version_vigente(p_campo, 'todas');
    if not public.etiqueta_en_lista(v_version, v_antes) then
      raise exception using errcode = '22023', message = 'valor_fuera_de_lista';
    end if;
    insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues, version_id)
    values (a.id, p_campo, p_red, 'confirma', v_antes, v_antes, v_version);
  end if;
end
$$;

-- 20261114000800's quitar_marca, now writing the removed mark's row to the log.
create or replace function public.quitar_marca(
  p_afirmacion uuid, p_marca text, p_red text, p_marca_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.afirmaciones;
  m public.afirmacion_marcas;
begin
  perform public.etiqueta_exigir(p_marca, p_red);
  if p_marca not in ('problema', 'solucion', 'emocion', 'publico', 'dato', 'caso') then
    raise exception using errcode = '22023', message = 'campo_desconocido';
  end if;
  a := public.etiqueta_afirmacion(p_afirmacion);
  if a.etiquetas_antiguas then
    raise exception using errcode = '22023', message = 'afirmacion_antigua';
  end if;
  m := public.etiqueta_marca(a.id, p_marca, p_red, p_marca_id, false);
  delete from public.afirmacion_marcas where id = m.id;
  insert into public.correcciones_de_etiqueta
    (afirmacion_id, campo, red, accion, antes, despues, frase_antes, certeza_antes, version_id, marca_id)
  values (a.id, p_marca, p_red, 'quita', m.valor, null, m.frase, m.certeza, m.version_id, m.id);
end
$$;

-- The doubtful tags (spec 6c-2): only visible claims, never anything of Coni's. tipo or evidencia in sin_clasificar on
-- any claim; on new claims a mark in sin_clasificar, otro or otra, or of low certainty; a hook not confirmed with high
-- certainty. A per-network mark stored with red `todas` is left out: 6c-1 neither shows nor accepts it.
create or replace function public.etiquetas_dudosas()
returns table (afirmacion_id uuid, campo text, red text, marca_id uuid, motivo text, creada_en timestamptz)
language sql stable security definer set search_path = '' as $$
  with visibles as (
    select a.id, a.tipo, a.evidencia, a.etiquetas_antiguas, a.creada_en
    from public.afirmaciones a
    join public.materiales_visibles m on m.id = a.material_id
    where not a.excluida
  )
  select v.id, 'tipo'::text, 'todas'::text, null::uuid, 'sin_clasificar'::text, v.creada_en
  from visibles v where v.tipo = 'sin_clasificar'
  union all
  select v.id, 'evidencia', 'todas', null, 'sin_clasificar', v.creada_en
  from visibles v where v.evidencia = 'sin_clasificar'
  union all
  select v.id, mk.marca, mk.red, mk.id,
         case when mk.valor = 'sin_clasificar' then 'sin_clasificar'
              when mk.valor in ('otro', 'otra') then 'otro'
              else 'certeza_baja' end,
         v.creada_en
  from visibles v
  join public.afirmacion_marcas mk on mk.afirmacion_id = v.id
  where not v.etiquetas_antiguas
    and mk.origen <> 'coni'
    and (mk.marca in ('dato', 'caso')) = (mk.red = 'todas')
    and (mk.valor in ('sin_clasificar', 'otro', 'otra') or mk.certeza = 'baja')
  union all
  select v.id, 'tipo_de_gancho', 'todas', null, 'gancho', v.creada_en
  from visibles v
  join public.ganchos g on g.afirmacion_id = v.id
  where g.certeza <> 'alta' and g.origen <> 'coni'
$$;

-- Fills a new batch: (1) what the most recent previous batch left still doubtful, in its old order; (2) the rest by
-- motivo; (3) the oldest claim first, then its id. One item per claim (inside a claim: the order of the fields), five
-- at most.
create or replace function public.llenar_lote_de_etiquetas(p_lote uuid, p_semana date) returns void
language sql security definer set search_path = '' as $$
  with dudosas as (
    select * from public.etiquetas_dudosas()
  ),
  anterior as (
    select i.posicion, i.afirmacion_id, i.campo, i.red, i.marca_id
    from public.lote_de_etiquetas_items i
    where i.lote_id = (
      select l.id from public.lotes_de_etiquetas l where l.semana < p_semana order by l.semana desc limit 1
    )
  ),
  candidatos as (
    select 0 as prioridad, a.posicion::integer as orden, d.creada_en,
           d.afirmacion_id, d.campo, d.red, d.marca_id, d.motivo
    from anterior a
    join dudosas d on d.afirmacion_id = a.afirmacion_id and d.campo = a.campo and d.red = a.red
      and d.marca_id is not distinct from a.marca_id
    union all
    select 1, array_position(array['sin_clasificar', 'otro', 'gancho', 'certeza_baja'], d.motivo), d.creada_en,
           d.afirmacion_id, d.campo, d.red, d.marca_id, d.motivo
    from dudosas d
  ),
  uno_por_afirmacion as (
    select distinct on (c.afirmacion_id) c.*
    from candidatos c
    order by c.afirmacion_id, c.prioridad, c.orden,
      array_position(
        array['tipo', 'evidencia', 'problema', 'solucion', 'emocion', 'publico', 'dato', 'caso', 'tipo_de_gancho'],
        c.campo
      ),
      c.red, c.marca_id
  ),
  elegidos as (
    select u.* from uno_por_afirmacion u
    order by u.prioridad, u.orden, u.creada_en, u.afirmacion_id
    limit 5
  )
  insert into public.lote_de_etiquetas_items (lote_id, posicion, afirmacion_id, campo, red, marca_id, motivo)
  select p_lote, (row_number() over (order by e.prioridad, e.orden, e.creada_en, e.afirmacion_id))::smallint,
         e.afirmacion_id, e.campo, e.red, e.marca_id, e.motivo
  from elegidos e
$$;

-- The week's batch with each item's state. Coni's first read of the week builds it; WAV only reads it (empty when it
-- does not exist yet); anyone else is refused. A batch built with nothing doubtful stays empty all week.
create or replace function public.lote_de_la_semana()
returns table (posicion smallint, afirmacion_id uuid, campo text, red text, marca_id uuid, motivo text, hecha boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_semana date := date_trunc('week', now() at time zone 'America/Santiago')::date;
  v_lote uuid;
begin
  if public.es_coni() then
    -- Two tabs on Monday: the second waits on the first one's row, inserts nothing, and reads what the first built.
    insert into public.lotes_de_etiquetas (semana) values (v_semana)
    on conflict (semana) do nothing
    returning id into v_lote;
    if v_lote is not null then
      perform public.llenar_lote_de_etiquetas(v_lote, v_semana);
    end if;
  elsif not public.es_mantenedor() then
    raise exception using errcode = '42501', message = 'solo_coni';
  end if;

  -- Done: the tag is no longer doubtful. Nothing is written to mark it, so a correction from the claim's page counts.
  return query
  with dudosas as (select * from public.etiquetas_dudosas())
  select i.posicion, i.afirmacion_id, i.campo, i.red, i.marca_id, i.motivo,
         not exists (
           select 1 from dudosas d
           where d.afirmacion_id = i.afirmacion_id and d.campo = i.campo and d.red = i.red
             and d.marca_id is not distinct from i.marca_id
         )
  from public.lote_de_etiquetas_items i
  join public.lotes_de_etiquetas l on l.id = i.lote_id
  where l.semana = v_semana
  order by i.posicion;
end
$$;

-- The helpers run only inside lote_de_la_semana (as its owner); sessions call lote_de_la_semana and nothing else.
revoke execute on function
  public.etiquetas_dudosas(),
  public.llenar_lote_de_etiquetas(uuid, date)
from public, anon, authenticated;
revoke execute on function public.lote_de_la_semana() from public, anon;
grant execute on function public.lote_de_la_semana() to authenticated;
