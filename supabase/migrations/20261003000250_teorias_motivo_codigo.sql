-- Why a theory failed, in a form the app and the retry can read: 'sin_sustento' (the cards do not hold a theory:
-- final, trying again spends the same answer), 'tope' (the monthly cap) or 'error' (anything else, worth a retry).
alter table public.teorias add column motivo_codigo text check (motivo_codigo in ('sin_sustento', 'tope', 'error'));
alter table public.teorias add constraint motivo_codigo_solo_si_fallida check (estado = 'fallida' or motivo_codigo is null);

-- Theories that failed before this column existed: the two final reasons are recognised by their text.
update public.teorias
   set motivo_codigo = case
     when motivo_fallo like 'No encontré suficiente apoyo%' then 'sin_sustento'
     else 'error'
   end
 where estado = 'fallida';

create or replace function public.marcar_teoria_disparo_fallido(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.teorias
     set estado = 'fallida', motivo_fallo = 'No pude iniciar la síntesis. Reintenta.', motivo_codigo = 'error'
   where id = p_id and estado = 'sintetizando';
end $$;

create or replace function public.reintentar_teoria(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_codigo text;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  select motivo_codigo into v_codigo from public.teorias where id = p_id and estado = 'fallida' for update;
  if not found then
    raise exception using errcode = '22023', message = 'teoria_no_reintentable';
  end if;
  -- The verdict is kept in the store, so a retry would only repeat it.
  if v_codigo = 'sin_sustento' then
    raise exception using errcode = '22023', message = 'teoria_sin_sustento';
  end if;
  update public.teorias set estado = 'sintetizando', motivo_fallo = null, motivo_codigo = null where id = p_id;
end $$;

-- Arguments and contradictions are the synthesis's: a person edits the title, the thesis and the category, and the
-- stored arguments (whose quotes were checked against the cards) are never replaced by what the caller sends.
drop function public.guardar_teoria(uuid, text, text, jsonb, jsonb, uuid);
create function public.guardar_teoria(
  p_id uuid,
  p_titulo text,
  p_tesis text,
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
         categoria_id = p_categoria,
         estado = 'guardada',
         editada_en = now()
   where id = p_id;
end $$;

revoke execute on function public.guardar_teoria(uuid, text, text, uuid) from public, anon;
grant execute on function public.guardar_teoria(uuid, text, text, uuid) to authenticated;
