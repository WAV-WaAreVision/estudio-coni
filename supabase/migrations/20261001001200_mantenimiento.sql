-- Maintenance (Plan 4): file retention and the renewal of Meta's token.
alter table public.piezas
  -- Set when the retention job deleted the files of a published or discarded piece, so it is not looked at again.
  add column archivos_borrados_en timestamptz;

-- When the long-lived Instagram token stops working (60 days after it was issued or renewed); "Conectar Instagram"
-- sets it and `mantenimiento` moves it forward.
alter table public.ajustes add column meta_token_expira_en timestamptz;

-- The renewed token replaces the Vault secret and the expiry changes in one transaction: a renewal that saved the
-- token but lost the date would be tried again with a token too new to renew (Instagram wants it 24 hours old).
-- It only replaces: the first token is always Coni's (`guardar_secreto`).
create function public.guardar_token_meta(p_token text, p_expira_en timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'meta';
  if not found then
    raise exception using errcode = 'P0001', message = 'token_meta_faltante';
  end if;
  perform vault.update_secret(v_id, p_token);
  update public.ajustes set meta_token_expira_en = p_expira_en where id;
end $$;

revoke execute on function public.guardar_token_meta(text, timestamptz) from public, anon, authenticated;
grant execute on function public.guardar_token_meta(text, timestamptz) to service_role;
