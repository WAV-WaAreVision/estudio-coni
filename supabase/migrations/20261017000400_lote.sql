-- Batch actions (spec 2026-10-17, part 4, decisions 23 to 26; plan docs/superpowers/plans/2026-10-17-lote.md,
-- amendments A4 to A6).

-- 1. Who discarded an idea and when: the batch undo (decision 24) only brings back what Coni herself discarded less
--    than 8 s ago by this database's clock. The system motive pilar_retirado leaves both empty.
alter table public.ideas
  add column descartada_en timestamptz,
  add column descartada_por uuid;

-- descartar_idea as of 20261003000400_motor.sql, plus the two stamps. Same signature, same errors.
create or replace function public.descartar_idea(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_motivo is null or p_motivo not in ('no_me_representa', 'repetida', 'debil', 'otro') then
    raise exception using errcode = '22023', message = 'motivo_invalido';
  end if;
  update public.ideas
     set estado = 'descartada', motivo_descarte = p_motivo, fijada_en = null,
         descartada_en = now(), descartada_por = auth.uid()
   where id = p_id and estado = 'idea';
  if not found then
    raise exception using errcode = '22023', message = 'no_descartable';
  end if;
end $$;

-- Up to five at once (MAXIMO_DE_IDEAS) with one motive: all of them or none, since another device may have taken one.
create function public.descartar_ideas(p_ids uuid[], p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_motivo is null or p_motivo not in ('no_me_representa', 'repetida', 'debil', 'otro') then
    raise exception using errcode = '22023', message = 'motivo_invalido';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 5 or array_position(p_ids, null) is not null
     or (select count(distinct i) from unnest(p_ids) as i) <> cardinality(p_ids) then
    raise exception using errcode = '22023', message = 'lote_invalido';
  end if;
  update public.ideas
     set estado = 'descartada', motivo_descarte = p_motivo, fijada_en = null,
         descartada_en = now(), descartada_por = auth.uid()
   where id = any (p_ids) and estado = 'idea';
  get diagnostics v_n = row_count;
  if v_n <> cardinality(p_ids) then
    raise exception using errcode = '22023', message = 'no_descartable';
  end if;
end $$;

-- "Deshacer" of the batch discard. Only Coni, only her own discards, only inside the window, never pilar_retirado,
-- and never into a pillar retired meanwhile. Returns the ids that came back; the rest stay discarded.
create function public.restaurar_ideas(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_vueltas uuid[];
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 5 then
    raise exception using errcode = '22023', message = 'lote_invalido';
  end if;
  with vueltas as (
    update public.ideas i
       set estado = 'idea', motivo_descarte = null, descartada_en = null, descartada_por = null
     where i.id = any (p_ids)
       and i.estado = 'descartada'
       and i.motivo_descarte is distinct from 'pilar_retirado'
       and i.descartada_por = auth.uid()
       and i.descartada_en > now() - interval '8 seconds'
       and exists (select 1 from public.categorias c where c.slug = i.pilar and c.es_pilar and c.activa)
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_vueltas from vueltas;
  return v_vueltas;
end $$;

revoke execute on function public.descartar_ideas(uuid[], text), public.restaurar_ideas(uuid[]) from public, anon;
grant execute on function public.descartar_ideas(uuid[], text), public.restaurar_ideas(uuid[]) to authenticated;

-- 2. A proposed date for a piece that has not passed gate 2 (decision 25). Its own table, not a column of piezas:
--    every update of piezas must bump its version (proteger_pieza), which would invalidate an open screen and the
--    running tasks' writes, and is logged whole in eventos, where docs/metricas-friccion.sql would read it as a step of
--    the piece. Nothing signs a proposal: gate 2 signs puerta2_publicar_en, and a signed piece always wins the slot.
create table public.fechas_propuestas (
  pieza_id uuid primary key references public.piezas (id) on delete cascade,
  publicar_en timestamptz not null,
  propuesta_en timestamptz not null default now()
);

alter table public.fechas_propuestas enable row level security;
create policy "coni y wav leen las fechas propuestas" on public.fechas_propuestas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Coni and WAV (the maintainer, who operates the app) read it from their own sessions, as the policy above says;
-- only proponer_fechas writes it. Nothing on the server uses the service role for it.
revoke all on public.fechas_propuestas from anon, authenticated, service_role;
grant select on public.fechas_propuestas to authenticated;

-- One event per piece and change (decision 26), under its own table name: the friction query reads only 'piezas'.
create trigger auditar after insert or update or delete on public.fechas_propuestas
  for each row execute function public.registrar_evento();

-- Repartir and Cambiar. The states are ORDEN_SIN_FECHA of lib/calendario/propuestas.ts: everything before gate 2.
create function public.proponer_fechas(p_piezas uuid[], p_fechas timestamptz[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_piezas is null or p_fechas is null or cardinality(p_piezas) <> cardinality(p_fechas)
     or cardinality(p_piezas) not between 1 and 200
     or array_position(p_piezas, null) is not null or array_position(p_fechas, null) is not null
     or (select count(distinct p) from unnest(p_piezas) as p) <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'lote_invalido';
  end if;
  -- for share holds the pieces until this commits: gate 2 cannot sign one between the check and the insert, and a
  -- piece signed while this waited is re-read in its new state and fails the check.
  select count(*) into v_n
    from (select p.id from public.piezas p
           where p.id = any (p_piezas)
             and p.estado in ('guion_en_proceso', 'guion_por_aprobar', 'guion_aprobado', 'grabando_voz', 'en_render',
                              'subtitulando', 'error_produccion', 'video_por_aprobar')
             for share) s;
  if exists (select 1 from unnest(p_fechas) as f where f <= now()) or v_n <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'propuesta_invalida';
  end if;
  insert into public.fechas_propuestas (pieza_id, publicar_en)
  select * from unnest(p_piezas, p_fechas)
  on conflict (pieza_id) do update set publicar_en = excluded.publicar_en, propuesta_en = now();
end $$;

revoke execute on function public.proponer_fechas(uuid[], timestamptz[]) from public, anon;
grant execute on function public.proponer_fechas(uuid[], timestamptz[]) to authenticated;
