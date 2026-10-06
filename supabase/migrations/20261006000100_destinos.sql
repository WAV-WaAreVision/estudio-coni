-- LinkedIn as a second destination, by hand (design 2026-10-06, D1, D3, D10).
-- The only allowed lists are the three below, so the check also keeps them non-empty, free of duplicates and in the
-- canonical order (Instagram first), which is the order the gate-2 hash uses.
alter table public.piezas
  add column texto_linkedin text,
  add column destinos text[] not null default '{instagram}',
  add column puerta2_formula smallint,
  add constraint destinos_validos check (
    destinos in ('{instagram}'::text[], '{linkedin}'::text[], '{instagram,linkedin}'::text[])
  ),
  add constraint puerta2_formula_valida check (puerta2_formula is null or puerta2_formula in (1, 2)),
  add constraint formula_con_aprobacion check (puerta2_formula is null or puerta2_hash_texto is not null),
  add constraint texto_linkedin_largo check (texto_linkedin is null or char_length(texto_linkedin) <= 3000);

comment on column public.piezas.puerta2_formula is
  'Formula of puerta2_hash_texto. Null is formula 1 (the caption alone, approvals from before 2026-10-06); 2 also binds the LinkedIn text and the destinations.';

alter table public.ajustes
  add column destinos_por_defecto text[] not null default '{instagram}',
  add constraint destinos_por_defecto_validos check (
    destinos_por_defecto in ('{instagram}'::text[], '{linkedin}'::text[], '{instagram,linkedin}'::text[])
  );

-- One row per piece and destination. The piece keeps its single state; this table says which destinations still wait.
create table public.publicaciones (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  destino text not null check (destino in ('instagram', 'linkedin')),
  estado text not null check (estado in ('esperando', 'para_subir', 'subido_a_mano', 'publicado')),
  enlace text,
  marcado_en timestamptz,
  marcado_por uuid,
  primary key (pieza_id, destino)
);

-- Existing pieces keep exactly today's behavior: Instagram only, formula 1. A piece in error_publicacion whose
-- approval still stands is waiting too: a retry puts it back on the schedule.
insert into public.publicaciones (pieza_id, destino, estado, enlace, marcado_en)
select
  id,
  'instagram',
  case
    when estado = 'para_subir_a_mano' then 'para_subir'
    when estado = 'publicado_a_mano' then 'subido_a_mano'
    when estado = 'publicado' then 'publicado'
    else 'esperando'
  end,
  case when estado in ('publicado_a_mano', 'publicado') then permalink end,
  case when estado in ('publicado_a_mano', 'publicado') then actualizada_en end
from public.piezas
where estado in ('programado', 'para_subir_a_mano', 'publicado_a_mano', 'publicado')
   or (estado = 'error_publicacion' and puerta2_hash_texto is not null);

alter table public.publicaciones enable row level security;
create policy "coni lee publicaciones" on public.publicaciones for select to authenticated
  using (public.es_coni());
-- No direct writes: only the security definer functions and the service role change it.
revoke all on public.publicaciones from anon, authenticated;
grant select on public.publicaciones to authenticated;

create trigger auditar after insert or update or delete on public.publicaciones
  for each row execute function public.registrar_evento();

-- proteger_pieza as of 20261004000110, plus: what gate 2 approved cannot change under it (the paths that change the
-- LinkedIn text or the destinations take the approval back in the same update), and puerta2_formula follows the approval.
create or replace function public.proteger_pieza()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  if old.puerta2_hash_texto is not null and new.puerta2_hash_texto is not null
     and (new.texto_linkedin is distinct from old.texto_linkedin or new.destinos is distinct from old.destinos) then
    raise exception using errcode = '42501', message = 'artefacto_aprobado';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
  end if;

  if new.avatar_id is distinct from old.avatar_id then
    if not public.es_coni() then
      raise exception using errcode = '42501', message = 'solo_coni_elige_avatar';
    end if;
    if old.estado <> 'guion_por_aprobar' then
      raise exception using errcode = '42501', message = 'avatar_fuera_del_guion';
    end if;
  end if;
  if new.puerta1_formula is distinct from old.puerta1_formula and not aprueba_puerta1 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.puerta2_formula is distinct from old.puerta2_formula
     and new.puerta2_hash_texto is not null and not aprueba_puerta2 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
  end if;

  if aprueba_puerta1 then
    new.puerta1_por := auth.uid();
  elsif new.puerta1_hash is null then
    new.puerta1_por := null;
  else
    new.puerta1_por := old.puerta1_por;
  end if;
  if aprueba_puerta2 then
    new.puerta2_por := auth.uid();
  elsif new.puerta2_hash_texto is null then
    new.puerta2_por := null;
  else
    new.puerta2_por := old.puerta2_por;
  end if;
  -- The formula describes an approval: without one there is nothing for it to describe.
  if new.puerta2_hash_texto is null then
    new.puerta2_formula := null;
  end if;

  new.actualizada_en := now();
  return new;
end $function$;
