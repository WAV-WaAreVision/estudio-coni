-- LinkedIn document carousels as their own piece (design 2026-10-26, D2, part 1). A carousel is LinkedIn only, never
-- has a voice, an avatar or a video, and its words live in `carruseles`, one row per version. Every existing row is a
-- reel (the default), and every check below holds for it as it is today.

alter table public.piezas
  add column tipo text not null default 'reel',
  -- Coni's sentence from "Pedir cambio" until the writer copies it into the new version (amendment 3).
  add column pedido_de_cambio text,
  add constraint tipo_valido check (tipo in ('reel', 'carrusel')),
  -- The reel's voice and video steps never apply to a carousel, and the carousel's steps never to a reel.
  add constraint estados_del_tipo check (
    case tipo
      when 'reel' then estado not in ('armando_carrusel', 'carrusel_por_aprobar')
      else estado not in ('guion_aprobado', 'grabando_voz', 'en_render', 'subtitulando', 'video_por_aprobar')
    end
  ),
  add constraint carrusel_solo_linkedin check (tipo = 'reel' or destinos = '{linkedin}'::text[]),
  -- Nothing a reel produces or signs can sit on a carousel: an old worker writing a script to one fails here.
  add constraint carrusel_sin_reel check (
    tipo = 'reel' or num_nulls(audio_id, video_id, render_id, avatar_id, guion, texto, puerta1_formula) = 7
  ),
  add constraint pedido_solo_de_carrusel check (tipo = 'carrusel' or pedido_de_cambio is null),
  add constraint pedido_no_vacio check (pedido_de_cambio is null or btrim(pedido_de_cambio) <> '');

comment on column public.piezas.tipo is
  'reel (voice, avatar, video, Instagram and/or LinkedIn) or carrusel (a LinkedIn document, design 2026-10-26). Never changes.';

create table public.carruseles (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  version integer not null check (version >= 1),
  -- [{tipo: portada|idea|cierre, texto, destacado?, fuente?}], read by lib/datos/carrusel.ts (leerLaminas).
  laminas jsonb not null check (jsonb_typeof(laminas) = 'array' and jsonb_array_length(laminas) >= 6),
  texto_post text not null check (btrim(texto_post) <> ''),
  -- hashTextoDeCarrusel (lib/dominio/puertas.ts): the words only, so a design change keeps gate 1 (D2, D5).
  hash_texto text not null check (hash_texto ~ '^[0-9a-f]{64}$'),
  diseno jsonb not null default '{"variante": "crema"}'::jsonb check (jsonb_typeof(diseno) = 'object'),
  estado text not null default 'escrito' check (estado in ('escrito', 'armando', 'listo', 'fallo')),
  origen text not null check (origen in ('inicial', 'cambio_texto', 'cambio_diseno', 'acortado')),
  pedido text,
  pdf_clave text,
  png_claves text[] not null default '{}',
  creado_en timestamptz not null default now(),
  unique (pieza_id, version),
  -- The target of piezas.puerta2_carrusel_id together with its piece, so gate 2 can only sign a version of its own.
  unique (id, pieza_id),
  constraint pedido_del_cambio check (
    case when origen = 'cambio_texto' then pedido is not null and btrim(pedido) <> '' else pedido is null end
  )
);

-- A version's words never change under gate 1: a new text is a new row. Its rendering state (part 2) may move.
create function public.proteger_carrusel() returns trigger
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
  return new;
end $$;

create trigger proteger_carrusel before insert or update on public.carruseles
  for each row execute function public.proteger_carrusel();
create trigger auditar after insert or update or delete on public.carruseles
  for each row execute function public.registrar_evento();

alter table public.carruseles enable row level security;
create policy "coni y wav leen carruseles" on public.carruseles for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- No direct writes: the service (the writer, and part 2's renderer) and the security definer functions only.
revoke all on public.carruseles from anon, authenticated;
grant select on public.carruseles to authenticated;

-- Gate 2 of a carousel signs a carousel version where a reel's signs a video (D2). All or none, as before, by type.
alter table public.piezas
  add column puerta2_carrusel_id uuid,
  add constraint puerta2_carrusel_de_la_pieza foreign key (puerta2_carrusel_id, id)
    references public.carruseles (id, pieza_id);
alter table public.piezas drop constraint puerta2_completa;
alter table public.piezas add constraint puerta2_completa check (
  case
    when puerta2_hash_texto is null
      then num_nulls(puerta2_video_id, puerta2_carrusel_id, puerta2_publicar_en, puerta2_en, puerta2_por) = 5
    when tipo = 'reel'
      then num_nulls(puerta2_video_id, puerta2_publicar_en, puerta2_en, puerta2_por) = 0 and puerta2_carrusel_id is null
    else num_nulls(puerta2_carrusel_id, puerta2_publicar_en, puerta2_en, puerta2_por) = 0 and puerta2_video_id is null
  end
);

-- aprobada_para_grabar as of 20261016000200, plus the two carousel states: both come after gate 1.
alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in (
    'guion_aprobado', 'en_render', 'subtitulando', 'video_por_aprobar', 'armando_carrusel', 'carrusel_por_aprobar',
    'programado', 'para_subir_a_mano', 'publicado', 'publicado_a_mano'
  )
  or puerta1_hash is not null
);

-- The LinkedIn document a carousel uploads (part 3), beside the video a reel uploads.
alter table public.publicaciones
  add column documento_urn text,
  add constraint documento_urn_es_de_documento check (
    documento_urn is null or documento_urn ~ '^urn:li:document:[A-Za-z0-9_-]+$'
  ),
  add constraint un_solo_medio check (video_urn is null or documento_urn is null);
