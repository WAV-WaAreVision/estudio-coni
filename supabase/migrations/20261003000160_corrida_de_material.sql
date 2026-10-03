-- Which Trigger run holds a material. A retry after an ambiguous dispatch failure can leave two runs of the same
-- material, and both would pay the providers: only the run that claimed it works. Written by the service role only
-- (members have no column grants on it).
alter table public.materiales
  add column corrida_id text,
  add column corrida_desde timestamptz;
