-- «Avisar a Federico» (spec 2026-11-07, decision 6 and amendment A11): one email to WAV per failure, however many
-- taps. Additive: one table and its functions. No existing row changes.

create table public.avisos_a_federico (
  id uuid primary key default gen_random_uuid(),
  -- The failure: entity, its id and a hash of the stored explanation (`claveDeAviso`).
  clave text not null unique check (char_length(clave) between 1 and 200),
  tipo text not null check (tipo in ('pieza', 'material')),
  entidad_id uuid not null,
  creado_en timestamptz not null default now(),
  -- When a caller took the job of sending the email. Concurrent callers see the claim and do not send it too; a claim
  -- five minutes old without `enviado_en` (its caller failed or died) is handed to the next caller.
  reclamado_en timestamptz,
  -- When WAV's email went out; a sent row never claims again.
  enviado_en timestamptz
);

alter table public.avisos_a_federico enable row level security;
revoke all on public.avisos_a_federico from anon, authenticated, service_role;
grant select on public.avisos_a_federico to authenticated, service_role;
create policy "coni y wav leen avisos a federico" on public.avisos_a_federico for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.avisos_a_federico
  for each row execute function public.registrar_evento();

-- Claims the email: true for exactly one caller at a time (an atomic update, so concurrent callers cannot both send
-- it). A sent row never claims again; a claim whose caller died is handed on after five minutes, as the pauses do.
create function public.reclamar_aviso_a_federico(p_clave text, p_tipo text, p_entidad_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_avisar boolean;
begin
  insert into public.avisos_a_federico (clave, tipo, entidad_id)
  values (p_clave, p_tipo, p_entidad_id)
  on conflict (clave) do nothing;
  update public.avisos_a_federico
     set reclamado_en = now()
   where clave = p_clave
     and enviado_en is null
     and (reclamado_en is null or reclamado_en < now() - interval '5 minutes')
  returning true into v_avisar;
  return coalesce(v_avisar, false);
end;
$$;

create function public.marcar_aviso_a_federico_enviado(p_clave text) returns void
language sql security definer set search_path = '' as $$
  update public.avisos_a_federico set enviado_en = now() where clave = p_clave and enviado_en is null;
$$;

-- A caller whose email to WAV failed lets go of its claim, so the next tap sends it at once.
create function public.soltar_aviso_a_federico(p_clave text) returns void
language sql security definer set search_path = '' as $$
  update public.avisos_a_federico set reclamado_en = null where clave = p_clave and enviado_en is null;
$$;

revoke execute on function public.reclamar_aviso_a_federico(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.marcar_aviso_a_federico_enviado(text) from public, anon, authenticated;
revoke execute on function public.soltar_aviso_a_federico(text) from public, anon, authenticated;
grant execute on function public.reclamar_aviso_a_federico(text, text, uuid) to service_role;
grant execute on function public.marcar_aviso_a_federico_enviado(text) to service_role;
grant execute on function public.soltar_aviso_a_federico(text) to service_role;
