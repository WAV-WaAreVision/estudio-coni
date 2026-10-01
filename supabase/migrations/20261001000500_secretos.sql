-- Coni enters her keys in Ajustes; they are stored encrypted in Vault and only server tasks read them (A7).
create function public.guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_guarda_llaves';
  end if;
  if p_nombre not in ('heygen', 'elevenlabs', 'anthropic', 'meta', 'metricool') then
    raise exception using errcode = '22023', message = 'cuenta_desconocida';
  end if;
  select id into v_id from vault.secrets where name = p_nombre;
  if found then
    perform vault.update_secret(v_id, p_valor);
  else
    perform vault.create_secret(p_valor, p_nombre);
  end if;
end $$;

create function public.leer_secreto(p_nombre text) returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nombre
$$;

revoke execute on function public.guardar_secreto(text, text), public.leer_secreto(text) from public, anon, authenticated;
grant execute on function public.guardar_secreto(text, text) to authenticated;
grant execute on function public.leer_secreto(text) to service_role;
