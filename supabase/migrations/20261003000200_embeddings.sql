create extension if not exists vector with schema extensions;

-- The vector type lives in `extensions`; every function here runs with search_path = '', so name it in full.
create table public.embeddings_ficha (
  material_id uuid primary key references public.materiales (id) on delete cascade,
  vector extensions.vector(1024) not null,
  modelo text not null,
  creado_en timestamptz not null default now()
);

create index embeddings_ficha_vector on public.embeddings_ficha
  using hnsw (vector extensions.vector_cosine_ops);

alter table public.embeddings_ficha enable row level security;
revoke all on public.embeddings_ficha from anon, authenticated;
grant select on public.embeddings_ficha to authenticated;

create policy "coni y wav leen embeddings" on public.embeddings_ficha for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

-- True when the card could not be embedded (no key, provider down, cap): the links are computed later.
-- Not in any `grant insert/update (...)` list of materiales, so only the service role writes it.
alter table public.materiales add column vinculos_pendientes boolean not null default false;
