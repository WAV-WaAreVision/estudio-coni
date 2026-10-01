-- Ajustes (Plan 5b, Track A).

-- The two notification switches of Ajustes. They are stored here; the notifier reads them when the daily summary
-- exists (design A9: today every notice goes out at once).
alter table public.ajustes
  add column avisos_resumen boolean not null default true,
  add column avisos_urgentes boolean not null default true;

-- Publishing days are ISO weekdays (Monday = 1 ... Sunday = 7) and there is at least one: the slot proposals
-- (lib/dominio/fechas.ts) read them as such. The app sends them sorted and without repeats.
alter table public.ajustes
  add constraint dias_publicacion_validos check (
    cardinality(dias_publicacion) between 1 and 7
    and dias_publicacion <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

-- "Conectar Instagram" (design A6): the long-lived token goes into Vault and the account and expiry into `ajustes` in
-- one transaction, so a connection can never be half saved (a token without its expiry would be renewed every night).
-- Coni's session calls it from the OAuth callback; nobody else can.
create function public.conectar_instagram(p_token text, p_cuenta text, p_expira_en timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_conecta_instagram';
  end if;
  if nullif(btrim(p_token), '') is null or nullif(btrim(p_cuenta), '') is null then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;
  select id into v_id from vault.secrets where name = 'meta';
  if found then
    perform vault.update_secret(v_id, p_token);
  else
    perform vault.create_secret(p_token, 'meta');
  end if;
  update public.ajustes set meta_cuenta_id = btrim(p_cuenta), meta_token_expira_en = p_expira_en where id;
end $$;

revoke execute on function public.conectar_instagram(text, text, timestamptz) from public, anon;
grant execute on function public.conectar_instagram(text, text, timestamptz) to authenticated;
