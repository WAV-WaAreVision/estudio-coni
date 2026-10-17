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
