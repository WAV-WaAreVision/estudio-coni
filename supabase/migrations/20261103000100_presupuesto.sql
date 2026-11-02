-- Budget panel and hard limit (spec 2026-11-02, change 12a of Coni's request, her decision A1). The monthly cap becomes
-- a reference with alarms in the panel; the hard limit (twice the cap unless Coni sets one) is the only brake. The
-- database stays the single gate (D6): reservar_gasto refuses unsigned spend over the limit, under the same per-month
-- lock as before, and always reserves signed work (D1).

alter table public.ajustes
  -- Null means twice the cap, so a new cap moves the default limit with it (D5).
  add column limite_duro_usd numeric(10, 2),
  -- What spends by itself today stays on, with a switch in Ajustes › Presupuesto (D2).
  add column motor_semanal_activo boolean not null default true,
  add column fusiones_nocturnas_activas boolean not null default true,
  add constraint limite_no_bajo_el_tope check (limite_duro_usd is null or limite_duro_usd >= tope_mensual_usd);

-- «Reactivar» (D4): the limit Coni set for one month. Written only through fijar_limite_del_mes().
create table public.limites_del_mes (
  mes date primary key check (mes = date_trunc('month', mes)::date),
  limite_usd numeric(10, 2) not null check (limite_usd > 0),
  fijado_por uuid not null,
  fijado_en timestamptz not null default now()
);

alter table public.limites_del_mes enable row level security;
create policy "coni y wav leen los limites del mes" on public.limites_del_mes for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
revoke all on public.limites_del_mes from anon;
revoke insert, update, delete, truncate on public.limites_del_mes from authenticated;
grant select on public.limites_del_mes to authenticated;
create trigger auditar after insert or update or delete on public.limites_del_mes
  for each row execute function public.registrar_evento();

-- The brake of the Santiago month of p_ahora: the month's row, else her limit, else twice the cap. Null only without
-- the settings row (reservar_gasto raises ajustes_faltantes first).
create function public.limite_del_mes(p_ahora timestamptz default now()) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select l.limite_usd from public.limites_del_mes l
      where l.mes = date_trunc('month', p_ahora at time zone 'America/Santiago')::date),
    (select coalesce(a.limite_duro_usd, 2 * a.tope_mensual_usd) from public.ajustes a where a.id)
  )
$$;

revoke execute on function public.limite_del_mes(timestamptz) from public, anon;
grant execute on function public.limite_del_mes(timestamptz) to authenticated, service_role;

drop function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid);

create function public.reservar_gasto(
  p_pieza uuid,
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now(),
  p_reabrir boolean default false,
  p_reservado_por uuid default null,
  -- Work already past gate 1 (voice, video, the shortening of a signed carousel): never stopped by the limit (D1).
  p_firmado boolean default false
) returns public.gastos
language plpgsql set search_path = '' as $$
declare
  v_mes date := date_trunc('month', p_ahora at time zone 'America/Santiago')::date;
  v_existente public.gastos;
  v_limite numeric;
  v_usado numeric;
  v_nuevo public.gastos;
begin
  -- One reservation at a time per month, so two runs started together cannot both pass the limit.
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));

  select * into v_existente from public.gastos where clave = p_clave;
  if found and not (p_reabrir and v_existente.estado = 'liberado' and v_existente.sin_cobro) then
    return v_existente;
  end if;

  -- Without the settings row there is no limit to compare with, and spend would pass unchecked.
  if not exists (select 1 from public.ajustes where id) then
    raise exception using errcode = 'P0001', message = 'ajustes_faltantes';
  end if;
  v_limite := public.limite_del_mes(p_ahora);
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if not p_firmado and v_usado + p_estimado > v_limite then
    raise exception using errcode = 'P0001', message = 'limite_alcanzado',
      detail = format('usado=%s;estimado=%s;limite=%s', v_usado, p_estimado, v_limite);
  end if;

  if v_existente.id is not null then
    -- Reopened: counted again in this month, with a fresh clock for the sweeper and no proof of "not charged".
    update public.gastos
       set estado = 'reservado', estimado_usd = p_estimado, real_usd = null, mes = v_mes,
           creado_en = now(), sin_cobro = false, reservado_por = p_reservado_por
     where id = v_existente.id
    returning * into v_nuevo;
  else
    insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave, reservado_por)
    values (p_pieza, p_proveedor, p_paso, v_mes, p_estimado, p_clave, p_reservado_por)
    returning * into v_nuevo;
  end if;
  return v_nuevo;
end $$;

revoke execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid, boolean)
  to service_role;

-- A spend without a piece (her own idea classified, ingestion, the engine, the topic jobs) is never signed work.
create or replace function public.reservar_gasto_general(
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now()
) returns public.gastos
language sql set search_path = '' as $$
  select * from public.reservar_gasto(null, p_proveedor, p_paso, p_estimado, p_clave, p_ahora, false, null, false)
$$;

-- «Reactivar»: Coni sets this month's limit, rounded to cents, never under the cap nor over US$ 1.000 (P9). It must
-- cover what the month already used, read under the month's lock so a reservation cannot slip in between. Her limit
-- notice of the month has done its job once she reactivated.
create function public.fijar_limite_del_mes(p_limite numeric) returns public.limites_del_mes
language plpgsql security definer set search_path = '' as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'America/Santiago')::date;
  v_tope numeric;
  v_usado numeric;
  v_fila public.limites_del_mes;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni';
  end if;
  p_limite := round(p_limite, 2);
  -- For share: a cap raised in another tab meanwhile is waited for, so the month's limit never ends under the cap.
  select tope_mensual_usd into v_tope from public.ajustes where id for share;
  if v_tope is null then
    raise exception using errcode = 'P0001', message = 'ajustes_faltantes';
  end if;
  if p_limite < v_tope then
    raise exception using errcode = '22023', message = 'limite_bajo_el_tope', detail = format('tope=%s', v_tope);
  end if;
  if p_limite > 1000 then
    raise exception using errcode = '22023', message = 'limite_alto';
  end if;
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if p_limite is null or p_limite <= v_usado then
    raise exception using errcode = '22023', message = 'limite_bajo', detail = format('usado=%s', v_usado);
  end if;
  insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (v_mes, p_limite, auth.uid())
  on conflict (mes) do update
    set limite_usd = excluded.limite_usd, fijado_por = excluded.fijado_por, fijado_en = now()
  returning * into v_fila;
  update public.avisos set leido_en = now()
   where clave = 'limite_alcanzado:' || to_char(v_mes, 'YYYY-MM') and leido_en is null;
  return v_fila;
end $$;

revoke execute on function public.fijar_limite_del_mes(numeric) from public, anon;
grant execute on function public.fijar_limite_del_mes(numeric) to authenticated;

-- `limite_alcanzado`: the month's hard limit. `tope_alcanzado` stays for the notices already stored. The full list
-- (20261101000100_registro_de_datos.sql plus this type); tests/integration/presupuesto-esquema.test.ts checks it equals
-- TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario',
  'limite_alcanzado'
));
