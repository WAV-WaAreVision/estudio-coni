-- When the current synthesis started. A retried theory keeps its old `creada_en`, so the sweep of syntheses that never
-- finished counts from here instead: it must not rescue a retry that has only just begun.
alter table public.teorias add column sintetizando_desde timestamptz not null default now();
update public.teorias set sintetizando_desde = creada_en;

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
  update public.teorias
     set estado = 'sintetizando', motivo_fallo = null, motivo_codigo = null, sintetizando_desde = now()
   where id = p_id;
end $$;
