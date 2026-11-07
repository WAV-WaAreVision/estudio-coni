-- Provider pauses (spec 2026-11-07, decisions 2 and 5; `avisada_en` is plan amendment A1). Additive: one table, its
-- index, its functions and one more notice kind. No existing row changes.

create table public.pausas_de_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null check (proveedor in ('elevenlabs', 'heygen', 'claude', 'voyage')),
  motivo text not null check (motivo in ('pago', 'cuota', 'llave')),
  -- Technical, for WAV: what the provider answered, already redacted by the client.
  detalle text not null check (char_length(detalle) <= 400),
  desde timestamptz not null default now(),
  -- When WAV's email went out; null means the next caller sends it again.
  avisada_en timestamptz,
  -- When a caller took the job of sending WAV's email. Concurrent callers see the claim and do not send it too; a
  -- claim five minutes old without `avisada_en` (its caller failed or died) is handed to the next caller.
  aviso_reclamado_en timestamptz,
  cerrada_en timestamptz,
  constraint pausa_cerrada_despues check (cerrada_en is null or cerrada_en >= desde)
);

-- At most one open pause per provider.
create unique index pausas_de_proveedor_una_abierta on public.pausas_de_proveedor (proveedor) where cerrada_en is null;

alter table public.pausas_de_proveedor enable row level security;
revoke all on public.pausas_de_proveedor from anon, authenticated, service_role;
grant select on public.pausas_de_proveedor to authenticated, service_role;
create policy "coni y wav leen pausas" on public.pausas_de_proveedor for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.pausas_de_proveedor
  for each row execute function public.registrar_evento();

-- Opens the provider's pause, or answers the open one as it is. `avisar` is true for exactly one caller at a time:
-- the one that claimed WAV's email (an atomic update, so concurrent callers cannot both send it).
create function public.abrir_pausa_de_proveedor(p_proveedor text, p_motivo text, p_detalle text)
returns table (pausa_id uuid, nueva boolean, avisar boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nueva boolean := false;
  v_avisar boolean;
begin
  insert into public.pausas_de_proveedor (proveedor, motivo, detalle)
  values (p_proveedor, p_motivo, left(p_detalle, 400))
  on conflict (proveedor) where cerrada_en is null do nothing
  returning public.pausas_de_proveedor.id into v_id;
  if v_id is not null then
    v_nueva := true;
  else
    select p.id into v_id
      from public.pausas_de_proveedor p
     where p.proveedor = p_proveedor and p.cerrada_en is null;
  end if;
  update public.pausas_de_proveedor
     set aviso_reclamado_en = now()
   where id = v_id
     and avisada_en is null
     and (aviso_reclamado_en is null or aviso_reclamado_en < now() - interval '5 minutes')
  returning true into v_avisar;
  return query select v_id, v_nueva, coalesce(v_avisar, false);
end;
$$;

create function public.marcar_pausa_avisada(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.pausas_de_proveedor set avisada_en = now() where id = p_id and avisada_en is null;
$$;

-- A caller whose email to WAV failed lets go of its claim, so the next caller (a retry) sends it at once.
create function public.soltar_aviso_de_pausa(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.pausas_de_proveedor set aviso_reclamado_en = null where id = p_id and avisada_en is null;
$$;

-- True only for the call that closed it, so a second closing run cannot notify twice.
create function public.cerrar_pausa_de_proveedor(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  cerradas int;
begin
  update public.pausas_de_proveedor set cerrada_en = now() where id = p_id and cerrada_en is null;
  get diagnostics cerradas = row_count;
  return cerradas = 1;
end;
$$;

revoke execute on function public.abrir_pausa_de_proveedor(text, text, text) from public, anon, authenticated;
revoke execute on function public.marcar_pausa_avisada(uuid) from public, anon, authenticated;
revoke execute on function public.cerrar_pausa_de_proveedor(uuid) from public, anon, authenticated;
revoke execute on function public.soltar_aviso_de_pausa(uuid) from public, anon, authenticated;
grant execute on function public.abrir_pausa_de_proveedor(text, text, text) to service_role;
grant execute on function public.marcar_pausa_avisada(uuid) to service_role;
grant execute on function public.cerrar_pausa_de_proveedor(uuid) to service_role;
grant execute on function public.soltar_aviso_de_pausa(uuid) to service_role;

-- `pausa_cerrada`: a provider pause closed (decision 5). The full list (20261105000200_angulos_de_pilar.sql plus this
-- type); presupuesto-esquema.test.ts and datos-personales-esquema.test.ts check it equals TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario',
  'limite_alcanzado', 'equilibrio_de_angulo', 'pausa_cerrada'
));
