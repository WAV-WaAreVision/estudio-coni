-- Issue 63: a sweep deletes uploads nobody confirmed. Their only trace is the time a material entered the queue, so
-- every way into `procesando` stamps it: the insert (default), the confirmation (poner_material_en_cola), Reintentar
-- and Reprocesar. Existing rows get the migration's time, so the first sweep cannot touch any of them for six hours.
alter table public.materiales
  add column en_cola_desde timestamptz not null default now();

-- The confirmation of an upload, before its run is started: only the uploader's own material, only while it is
-- processing (a reason left by a failed start does not block a second confirmation; the sweep skips those). False when nothing matched, so the app does not start a run for a row the sweep or
-- another action already took.
create function public.poner_material_en_cola(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set en_cola_desde = now()
   where id = p_id
     and subido_por = auth.uid()
     and estado = 'procesando'
     and borrar_desde is null;
  get diagnostics actualizado = row_count;
  return actualizado > 0;
end;
$$;

revoke execute on function public.poner_material_en_cola(uuid) from public, anon;
grant execute on function public.poner_material_en_cola(uuid) to authenticated;

-- Same as 20261003000130, plus the stamp.
create or replace function public.reintentar_material(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set estado = 'procesando', motivo_fallo = null, en_cola_desde = now()
   where id = p_id
     and (estado = 'fallido' or (estado = 'procesando' and motivo_fallo is not null));
  get diagnostics actualizado = row_count;
  if actualizado = 0 then
    raise exception using errcode = '22023', message = 'no_reintentable';
  end if;
end;
$$;

-- Same as 20261003000347, plus the stamp.
create or replace function public.reprocesar_material(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actualizado int;
  tema uuid;
  afectados uuid[];
  rol_actual text;
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales
     set estado = 'procesando', motivo_fallo = null, costo_estimado_usd = null, costo_confirmado_en = null,
         en_cola_desde = now()
   where id = p_id and estado = 'listo'
  returning rol into rol_actual;
  get diagnostics actualizado = row_count;
  if actualizado = 0 then
    raise exception using errcode = '22023', message = 'no_reprocesable';
  end if;

  select coalesce(array_agg(distinct tema_id), '{}') into afectados
    from public.afirmaciones where material_id = p_id and tema_id is not null;
  delete from public.afirmaciones where material_id = p_id;

  -- The delete trigger already recalculates these; the explicit pass keeps the contract visible and is idempotent.
  foreach tema in array afectados loop
    perform public.recalcular_tema(tema);
  end loop;

  if rol_actual <> 'estrategia' then
    delete from public.fichas where material_id = p_id;
  end if;
end $$;
