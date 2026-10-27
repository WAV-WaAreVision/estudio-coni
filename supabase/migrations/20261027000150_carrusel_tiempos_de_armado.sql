-- Final review of carousels part 2: a render is measured from when it was asked for and from when its run started,
-- never from piezas.actualizada_en (the render only writes `carruseles`, so a carousel signed days before the deploy
-- looked stuck the moment the sweep started it). The maintenance gives up on a render that started an hour ago, or on
-- one asked for a day ago that never started.
alter table public.carruseles
  add column armado_pedido_en timestamptz,
  add column armado_empezo_en timestamptz;

-- proteger_carrusel as of 20261027000120, plus: a rendered version keeps when it was asked for and when it started.
create or replace function public.proteger_carrusel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.piezas where id = new.pieza_id and tipo = 'carrusel') then
      raise exception using errcode = '42501', message = 'pieza_no_es_carrusel';
    end if;
    return new;
  end if;
  if new.pieza_id is distinct from old.pieza_id or new.version is distinct from old.version
     or new.laminas is distinct from old.laminas or new.texto_post is distinct from old.texto_post
     or new.hash_texto is distinct from old.hash_texto or new.diseno is distinct from old.diseno
     or new.origen is distinct from old.origen or new.pedido is distinct from old.pedido
     or new.creado_en is distinct from old.creado_en then
    raise exception using errcode = '42501', message = 'carrusel_inmutable';
  end if;
  if old.estado = 'listo' and (
    new.estado is distinct from old.estado or new.pdf_clave is distinct from old.pdf_clave
    or new.png_claves is distinct from old.png_claves
    or new.armado_pedido_en is distinct from old.armado_pedido_en
    or new.armado_empezo_en is distinct from old.armado_empezo_en
  ) then
    raise exception using errcode = '42501', message = 'carrusel_inmutable';
  end if;
  return new;
end $$;

-- Every way into armando_carrusel (her signature, a design change, Reintentar) asks for a render of the latest version:
-- stamped here, and the start of an earlier attempt forgotten, so the maintenance never times the new request by it.
-- security definer: Coni signs with her session, which cannot write `carruseles`.
create function public.pedir_armado_de_carrusel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.carruseles c set armado_pedido_en = now(), armado_empezo_en = null
   where c.pieza_id = new.id and c.estado <> 'listo'
     and c.version = (select max(v.version) from public.carruseles v where v.pieza_id = new.id);
  return null;
end $$;

revoke execute on function public.pedir_armado_de_carrusel() from public, anon, authenticated;

create trigger pedir_armado_de_carrusel after update of estado on public.piezas
  for each row when (new.tipo = 'carrusel' and new.estado = 'armando_carrusel' and old.estado is distinct from new.estado)
  execute function public.pedir_armado_de_carrusel();

-- Carousels already waiting (signed under part 1, plan amendment 9) are asked for now, at the deploy.
update public.carruseles c set armado_pedido_en = now()
  from public.piezas p
 where p.id = c.pieza_id and p.tipo = 'carrusel' and p.estado = 'armando_carrusel' and c.estado <> 'listo'
   and c.version = (select max(v.version) from public.carruseles v where v.pieza_id = p.id);
