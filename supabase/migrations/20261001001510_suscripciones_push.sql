-- Devices where Coni asked for notices (Plan 6). The endpoint and its keys are not passwords, but whoever has them can
-- push to that phone, so only she sees her own and the sender (service_role) reads them to send.
-- NOT audited on purpose: the audit log (`eventos`) is readable by the maintainer and would copy the keys.
create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 512),
  auth text not null check (length(auth) between 1 and 512),
  user_agent text check (length(user_agent) <= 300),
  creada_en timestamptz not null default now(),
  ultimo_ok_en timestamptz,
  -- Answers that were not 404/410 but did not deliver: a count in a row, reset on a good one.
  fallos integer not null default 0 check (fallos >= 0)
);

alter table public.suscripciones_push enable row level security;

create policy "coni ve sus suscripciones" on public.suscripciones_push for select to authenticated
  using (public.es_coni() and user_id = auth.uid());
create policy "coni suscribe su aparato" on public.suscripciones_push for insert to authenticated
  with check (public.es_coni() and user_id = auth.uid());
create policy "coni quita su aparato" on public.suscripciones_push for delete to authenticated
  using (public.es_coni() and user_id = auth.uid());

revoke all on public.suscripciones_push from anon, authenticated;
grant select, insert, delete on public.suscripciones_push to authenticated;
