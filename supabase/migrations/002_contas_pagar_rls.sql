-- Adds the missing multi-tenant RLS policy for contas_pagar.
-- Applied directly via Supabase SQL Editor on 2026-08-03.
--
-- contas_pagar was created after 001_multi_tenant.sql, with RLS enabled by
-- default but no policy attached -- same "fully locked down" state the other
-- 3 tables were in before that migration. Without this, the dashboard's
-- authenticated frontend session gets 0 rows back silently (RLS default-denies
-- when enabled with no matching policy, it doesn't error).
create policy "contas_pagar_select_own_org" on public.contas_pagar for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));
