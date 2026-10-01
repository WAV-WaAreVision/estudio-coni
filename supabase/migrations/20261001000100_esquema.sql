-- States mirror lib/dominio/estados.ts (ESTADOS); keep both in sync.
create type public.estado_pieza as enum (
  'idea', 'guion_en_proceso', 'guion_por_aprobar', 'en_render', 'subtitulando', 'video_por_aprobar',
  'programado', 'publicado', 'error_produccion', 'error_publicacion', 'descartado'
);
create type public.pilar as enum ('pareja', 'deseo', 'autoestima', 'limites', 'bienestar');

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  numero integer unique,
  pilar public.pilar not null,
  gancho text not null,
  tema text not null default '',
  formato text not null default '',
  fuerza text not null check (fuerza in ('alta', 'media', 'baja')),
  alertas jsonb not null default '[]'::jsonb,
  fuentes jsonb not null default '[]'::jsonb,
  estado text not null default 'idea' check (estado in ('idea', 'usada', 'descartada')),
  creada_en timestamptz not null default now()
);

create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references public.ideas (id),
  titulo text not null,
  estado public.estado_pieza not null default 'idea',
  version integer not null default 0,
  intento integer not null default 0 check (intento >= 0),
  estado_antes_del_error public.estado_pieza
    check (estado_antes_del_error in ('en_render', 'subtitulando', 'programado')),
  guion text,
  texto text,
  audio_id text,
  video_id text,
  -- HeyGen's render id, checked before POST /v3/videos on a retry (Plan 1 carried item).
  render_id text,
  puerta1_hash text,
  puerta1_en timestamptz,
  puerta1_por uuid references auth.users (id),
  puerta2_video_id text,
  puerta2_hash_texto text,
  puerta2_publicar_en timestamptz,
  puerta2_en timestamptz,
  puerta2_por uuid references auth.users (id),
  explicacion text,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  constraint puerta1_completa check (
    num_nulls(puerta1_hash, puerta1_en, puerta1_por) in (0, 3)
  ),
  constraint puerta2_completa check (
    num_nulls(puerta2_video_id, puerta2_hash_texto, puerta2_publicar_en, puerta2_en, puerta2_por) in (0, 5)
  ),
  -- A piece can only be on its way to video with an approved script, and only be scheduled or
  -- published with an approved video, caption and time.
  constraint aprobada_para_grabar check (
    estado not in ('en_render', 'subtitulando', 'video_por_aprobar', 'programado', 'publicado')
    or puerta1_hash is not null
  ),
  constraint aprobada_para_publicar check (
    estado not in ('programado', 'publicado') or puerta2_hash_texto is not null
  ),
  constraint error_con_origen check (
    (estado in ('error_produccion', 'error_publicacion')) = (estado_antes_del_error is not null)
  )
);
create index piezas_estado_hora on public.piezas (estado, puerta2_publicar_en);

create table public.ajustes (
  id boolean primary key default true check (id),
  tope_mensual_usd numeric(10, 2) not null default 40 check (tope_mensual_usd >= 0),
  meta text not null default 'consultas' check (meta in ('consultas', 'talleres', 'marca')),
  dias_publicacion smallint[] not null default '{2,4,6}',
  hora_publicacion time not null default '19:00',
  zona text not null default 'America/Santiago',
  -- ConfigProduccion (lib/proveedores/heygen.ts); validated in the app with zod before use.
  produccion jsonb not null default '{}'::jsonb
);

create table public.eventos (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the audit log must outlive the rows it describes, and an
  -- ON DELETE action would have to update this append-only table.
  pieza_id uuid,
  tabla text not null,
  operacion text not null,
  actor_usuario uuid,
  actor_rol text not null,
  datos jsonb,
  en timestamptz not null default now()
);
create index eventos_pieza on public.eventos (pieza_id);

create table public.intervenciones (
  id bigint generated always as identity primary key,
  quien text not null,
  que text not null,
  canal text not null check (canal in ('app', 'heygen', 'elevenlabs', 'meta', 'trigger', 'sql', 'otro')),
  pieza_id uuid references public.piezas (id),
  en timestamptz not null default now(),
  registrada_por uuid default auth.uid()
);

create table public.gastos (
  id bigint generated always as identity primary key,
  pieza_id uuid references public.piezas (id),
  proveedor text not null check (proveedor in ('heygen', 'elevenlabs', 'anthropic')),
  paso text not null,
  mes date not null,
  estimado_usd numeric(10, 4) not null check (estimado_usd > 0),
  real_usd numeric(10, 4) check (real_usd >= 0),
  estado text not null default 'reservado' check (estado in ('reservado', 'confirmado', 'liberado')),
  clave text not null unique,
  creado_en timestamptz not null default now()
);
create index gastos_mes on public.gastos (mes, estado);
