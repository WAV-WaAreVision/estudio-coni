-- LinkedIn phase 2 (design 2026-10-07, L3, L4): Coni connects her profile with OAuth. The token goes into Vault and the
-- member, the name and the expiry into `ajustes`, in one transaction, so a connection is never half saved.
alter table public.ajustes
  add column linkedin_miembro text,
  add column linkedin_nombre text,
  add column linkedin_token_expira_en timestamptz,
  add column linkedin_conectado_en timestamptz,
  -- The API version WAV was already told is about to sunset: the nightly run tells it once per version.
  add column linkedin_version_avisada text,
  add constraint linkedin_completo check (
    (linkedin_miembro is null) = (linkedin_token_expira_en is null)
    and (linkedin_miembro is null) = (linkedin_conectado_en is null)
  ),
  add constraint linkedin_miembro_es_persona check (
    linkedin_miembro is null or linkedin_miembro ~ '^urn:li:person:[A-Za-z0-9_-]+$'
  );

create function public.conectar_linkedin(p_token text, p_miembro text, p_nombre text, p_expira_en timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_conecta_linkedin';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;
  if p_miembro is null or p_miembro !~ '^urn:li:person:[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'miembro_invalido';
  end if;
  select id into v_id from vault.secrets where name = 'linkedin';
  if found then
    perform vault.update_secret(v_id, btrim(p_token));
  else
    perform vault.create_secret(btrim(p_token), 'linkedin');
  end if;
  update public.ajustes
     set linkedin_miembro = p_miembro,
         linkedin_nombre = nullif(btrim(p_nombre), ''),
         linkedin_token_expira_en = p_expira_en,
         linkedin_conectado_en = now()
   where id;
end $$;

-- There is no revoke endpoint in LinkedIn's docs (F13): disconnecting forgets our copy.
create function public.desconectar_linkedin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_desconecta_linkedin';
  end if;
  delete from vault.secrets where name = 'linkedin';
  update public.ajustes
     set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null
   where id;
end $$;

-- Used by marcar_subido_como_coni: while this is true a waiting LinkedIn row goes out by itself.
create function public.linkedin_conectado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ajustes where linkedin_miembro is not null and linkedin_token_expira_en > now()
  )
$$;

revoke execute on function public.conectar_linkedin(text, text, text, timestamptz) from public, anon;
grant execute on function public.conectar_linkedin(text, text, text, timestamptz) to authenticated;
revoke execute on function public.desconectar_linkedin() from public, anon;
grant execute on function public.desconectar_linkedin() to authenticated;
revoke execute on function public.linkedin_conectado() from public, anon;
grant execute on function public.linkedin_conectado() to authenticated, service_role;

-- `linkedin_por_vencer`: the 60-day token has no refresh for a self-serve app (F12); Coni renews it from Ajustes.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer'
));
