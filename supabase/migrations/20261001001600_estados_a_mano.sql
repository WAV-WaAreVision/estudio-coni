-- Manual upload mode (Instagram not connected yet). The two new states mirror lib/dominio/estados.ts (ESTADOS).
-- A new enum value cannot be used in the transaction that adds it, so the constraints, the trigger and the notice
-- kind that name them are in the next migration.
alter type public.estado_pieza add value if not exists 'para_subir_a_mano';
alter type public.estado_pieza add value if not exists 'publicado_a_mano';
