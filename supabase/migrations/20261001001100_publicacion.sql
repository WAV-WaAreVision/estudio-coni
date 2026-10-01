-- Publishing to Instagram (Plan 4). All of these columns are operational: only server tasks write them, and none is
-- part of an approval, so `proteger_pieza` lets them through like `render_id`.
alter table public.piezas
  -- The Reels container created for one approval (`contenedor_clave` is the idempotency key it was made for), so a
  -- retry reuses it instead of creating a second one.
  add column contenedor_id text,
  add column contenedor_clave text,
  -- Set right before `media_publish` is sent and never cleared by a retry: Instagram's docs do not say that repeating
  -- the call is safe, so a piece with this set and no `media_id` is resolved by reading the container first.
  add column publicacion_enviada_en timestamptz,
  add column media_id text,
  add column permalink text,
  -- A lease: `tomar_para_publicar` hands a piece to one run at a time.
  add column publicacion_reclamada_hasta timestamptz;

-- The Instagram account (IG_ID) the token belongs to; Coni's "Conectar Instagram" fills it. The token itself is the
-- Vault secret `meta`.
alter table public.ajustes add column meta_cuenta_id text;

-- Takes at most one scheduled piece whose approved time has come and leases it for p_arriendo_segundos, so two runs
-- (a retry, an overlapping cron, a run that died) never publish the same piece. `for update skip locked` covers the
-- instant of the claim and the lease covers the minutes that publishing takes.
create function public.tomar_para_publicar(p_ahora timestamptz, p_arriendo_segundos integer default 600)
returns setof public.piezas
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.piezas
   where estado = 'programado'
     and puerta2_publicar_en <= p_ahora
     and (publicacion_reclamada_hasta is null or publicacion_reclamada_hasta <= p_ahora)
   order by puerta2_publicar_en, id
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;
  return query
    update public.piezas
       set publicacion_reclamada_hasta = p_ahora + make_interval(secs => p_arriendo_segundos),
           version = version + 1
     where id = v_id
    returning *;
end $$;

revoke execute on function public.tomar_para_publicar(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.tomar_para_publicar(timestamptz, integer) to service_role;
