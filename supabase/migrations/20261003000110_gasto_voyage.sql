-- Embeddings are billed by Voyage, so their spend must count against the monthly cap like any other provider.
alter table public.gastos drop constraint gastos_proveedor_check;
alter table public.gastos
  add constraint gastos_proveedor_check check (proveedor in ('heygen', 'elevenlabs', 'anthropic', 'voyage'));
