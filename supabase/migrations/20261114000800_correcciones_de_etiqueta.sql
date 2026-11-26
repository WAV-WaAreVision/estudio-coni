-- Change 6c-1: Coni sees and corrects a claim's tags. Adds a log and the functions that write it; changes no row.

-- Every confirmation, correction, addition and removal, append only. 6c-3 reads it for the monthly error report
-- (index below) and relates errors to the extraction's certainty (`certeza_antes`).
create table public.correcciones_de_etiqueta (
  id uuid primary key default gen_random_uuid(),
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  campo text not null check (campo in (
    'tipo', 'evidencia', 'problema', 'solucion', 'emocion', 'publico', 'dato', 'caso', 'tipo_de_gancho'
  )),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  accion text not null check (accion in ('confirma', 'corrige', 'agrega', 'quita')),
  antes text,
  despues text,
  frase_antes text,
  frase_despues text,
  por_que text,
  certeza_antes text check (certeza_antes in ('alta', 'media', 'baja')),
  version_id integer references public.versiones_de_vocabulario (id),
  creada_en timestamptz not null default now(),
  constraint correcciones_antes_check check ((accion = 'agrega') = (antes is null)),
  constraint correcciones_despues_check check ((accion = 'quita') = (despues is null)),
  constraint correcciones_confirma_check check (accion <> 'confirma' or antes = despues),
  constraint correcciones_por_que_check check (
    campo in ('dato', 'caso') or despues is null or despues not in ('otro', 'otra') or coalesce(por_que, '') <> ''
  )
);
create index correcciones_de_etiqueta_informe on public.correcciones_de_etiqueta (campo, accion, creada_en);
create index correcciones_de_etiqueta_afirmacion on public.correcciones_de_etiqueta (afirmacion_id);

alter table public.correcciones_de_etiqueta enable row level security;
revoke all on public.correcciones_de_etiqueta from anon, authenticated;
grant select on public.correcciones_de_etiqueta to authenticated;
grant all on public.correcciones_de_etiqueta to service_role;
create policy "coni y wav leen correcciones" on public.correcciones_de_etiqueta for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

-- Old or new (spec 6c-1, Federico 2026-11-26): a claim is old only if it already existed before this change with no
-- marks and no hook row; only those wait for change 7's reprocess to get their marks. Every claim extracted from now on
-- is new, even one that came out with zero marks, so Coni can add marks to it. Inferring it from the marks would turn a
-- post-6a claim with zero marks old for good. Default false makes every future claim new; the update marks the old ones
-- once. Change 7's reprocess sets it back to false when it fills a claim's marks.
alter table public.afirmaciones add column etiquetas_antiguas boolean not null default false;
update public.afirmaciones a set etiquetas_antiguas = true
where not exists (select 1 from public.afirmacion_marcas m where m.afirmacion_id = a.id)
  and not exists (select 1 from public.ganchos g where g.afirmacion_id = a.id);

-- FUNCTIONS. All `create or replace`: a fix during development re-runs this part alone (see the plan), never a reset.

-- The closed list a field takes its values from (6a's `listaDeMarca`); null for dato and caso.
create or replace function public.etiqueta_lista_de_campo(p_campo text) returns text
language sql immutable set search_path = '' as $$
  select case p_campo
    when 'tipo' then 'tipo'
    when 'evidencia' then 'evidencia'
    when 'problema' then 'dolor'
    when 'solucion' then 'dolor'
    when 'emocion' then 'emocion'
    when 'publico' then 'publico'
    when 'tipo_de_gancho' then 'gancho'
  end
$$;

-- The vigente version of a list for a network: público and dolor differ per network, the rest are one for both.
create or replace function public.etiqueta_version_vigente(p_lista text, p_red text) returns integer
language sql stable set search_path = '' as $$
  select v.id from public.versiones_de_vocabulario v
  where v.lista = p_lista and v.estado = 'vigente'
    and v.red = case when p_lista in ('publico', 'dolor') then p_red else 'todas' end
$$;

-- A value of that version that has not been retired.
create or replace function public.etiqueta_en_lista(p_version integer, p_valor text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.versiones_de_vocabulario v, jsonb_array_elements(v.valores) e
    where v.id = p_version and e->>'valor' = p_valor and not coalesce((e->>'retirado')::boolean, false)
  )
$$;

-- Coni only; a known field; the network the field takes (per network for four marks, `todas` for the rest).
create or replace function public.etiqueta_exigir(p_campo text, p_red text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_corrige';
  end if;
  if p_campo is null or p_campo not in (
    'tipo', 'evidencia', 'problema', 'solucion', 'emocion', 'publico', 'dato', 'caso', 'tipo_de_gancho'
  ) then
    raise exception using errcode = '22023', message = 'campo_desconocido';
  end if;
  if p_red is null or p_red not in ('linkedin', 'instagram', 'todas')
     or (p_campo in ('problema', 'solucion', 'emocion', 'publico')) <> (p_red in ('linkedin', 'instagram')) then
    raise exception using errcode = '22023', message = 'red_invalida';
  end if;
end
$$;

-- The claim as the Biblioteca shows it (not hidden, its material not deleted with «Deshacer»), locked.
create or replace function public.etiqueta_afirmacion(p_afirmacion uuid) returns public.afirmaciones
language plpgsql set search_path = '' as $$
declare
  a public.afirmaciones;
begin
  select f.* into a
  from public.afirmaciones f
  join public.materiales_visibles m on m.id = f.material_id
  where f.id = p_afirmacion and not f.excluida
  for update of f;
  if a.id is null then
    raise exception using errcode = 'P0002', message = 'afirmacion_inexistente';
  end if;
  return a;
end
$$;

-- The mark row to act on, locked: the one named by id, else the only one of that mark and network. With
-- `p_puede_faltar` a missing row comes back empty (all nulls) for corregir_etiqueta to add it.
create or replace function public.etiqueta_marca(
  p_afirmacion uuid, p_marca text, p_red text, p_marca_id uuid, p_puede_faltar boolean
) returns public.afirmacion_marcas
language plpgsql set search_path = '' as $$
declare
  m public.afirmacion_marcas;
  cuantas integer;
begin
  if p_marca_id is not null then
    select * into m from public.afirmacion_marcas
    where id = p_marca_id and afirmacion_id = p_afirmacion and marca = p_marca and red = p_red
    for update;
    if m.id is null then
      raise exception using errcode = 'P0002', message = 'sin_marca';
    end if;
    return m;
  end if;
  select count(*) into cuantas from public.afirmacion_marcas
  where afirmacion_id = p_afirmacion and marca = p_marca and red = p_red;
  if cuantas > 1 then
    raise exception using errcode = '22023', message = 'marca_ambigua';
  end if;
  select * into m from public.afirmacion_marcas
  where afirmacion_id = p_afirmacion and marca = p_marca and red = p_red
  for update;
  if m.id is null and not p_puede_faltar then
    raise exception using errcode = 'P0002', message = 'sin_marca';
  end if;
  return m;
end
$$;

-- Coni corrects one tag (spec 6c-1). tipo and evidencia on any claim; marks only on a new one, the row updated or
-- added; the hook type on its `ganchos` row. One log row in the same transaction: `corrige`, `agrega`, or `confirma`
-- when nothing changed.
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
      values (a.id, p_campo, p_red, v_valor, v_frase, 'alta', v_por_que, v_version, 'coni');
      v_accion := 'agrega';
    else
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
      (afirmacion_id, campo, red, accion, antes, despues, frase_antes, frase_despues, por_que, certeza_antes, version_id)
    values (
      a.id, p_campo, p_red, v_accion, m.valor, v_valor,
      case when m.frase is distinct from v_frase then m.frase end,
      case when m.frase is distinct from v_frase then v_frase end,
      v_por_que, m.certeza, v_version
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

-- «Está bien»: the value stays; a mark or a hook becomes alta and Coni's. Logs `confirma`.
create or replace function public.confirmar_etiqueta(
  p_afirmacion uuid, p_campo text, p_red text, p_marca_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.afirmaciones;
  m public.afirmacion_marcas;
  g public.ganchos;
  v_antes text;
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
      (afirmacion_id, campo, red, accion, antes, despues, por_que, certeza_antes, version_id)
    values (a.id, p_campo, p_red, 'confirma', m.valor, m.valor, m.por_que, m.certeza, m.version_id);

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
    v_antes := case when p_campo = 'tipo' then a.tipo else a.evidencia end;
    if v_antes = 'sin_clasificar' then
      raise exception using errcode = '22023', message = 'valor_fuera_de_lista';
    end if;
    insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues, version_id)
    values (a.id, p_campo, p_red, 'confirma', v_antes, v_antes,
            public.etiqueta_version_vigente(p_campo, 'todas'));
  end if;
end
$$;

-- «Quitar»: deletes one mark of a new claim and logs `quita` with what it was.
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
    (afirmacion_id, campo, red, accion, antes, despues, frase_antes, certeza_antes, version_id)
  values (a.id, p_marca, p_red, 'quita', m.valor, null, m.frase, m.certeza, m.version_id);
end
$$;

-- The helpers run only inside the three functions (as their owner); sessions call the three and nothing else.
revoke execute on function
  public.etiqueta_lista_de_campo(text),
  public.etiqueta_version_vigente(text, text),
  public.etiqueta_en_lista(integer, text),
  public.etiqueta_exigir(text, text),
  public.etiqueta_afirmacion(uuid),
  public.etiqueta_marca(uuid, text, text, uuid, boolean)
from public, anon, authenticated;
revoke execute on function
  public.corregir_etiqueta(uuid, text, text, text, text, text, uuid),
  public.confirmar_etiqueta(uuid, text, text, uuid),
  public.quitar_marca(uuid, text, text, uuid)
from public, anon;
grant execute on function
  public.corregir_etiqueta(uuid, text, text, text, text, text, uuid),
  public.confirmar_etiqueta(uuid, text, text, uuid),
  public.quitar_marca(uuid, text, text, uuid)
to authenticated;
