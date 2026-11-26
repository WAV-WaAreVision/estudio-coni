-- Change 6a: the list validator is only the body of a check constraint; nobody calls it directly. Constraints run
-- with the table owner's rights, so revoking the default PUBLIC execute does not affect inserts.
revoke execute on function public.valores_de_vocabulario_validos(text, jsonb) from public, anon, authenticated;
