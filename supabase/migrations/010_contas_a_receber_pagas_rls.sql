-- Torna contas_a_receber / contas_pagas visíveis para a sessão autenticada do
-- dashboard e garante que toda linha carregue o organizacao_id da Incontec.
--
-- As duas tabelas são populadas pelo workflow n8n "Projeto Final - Visconde"
-- (trigger AGENDAMENTO -> SALVAR SUPABASE3 / SALVAR SUPABASE5). Mesmo padrão
-- de RLS de 002_contas_pagar_rls.sql. Aplicar via SQL Editor do Supabase.
-- Idempotente -- pode rodar mais de uma vez sem problema.

-- 1. Backfill: linhas antigas gravadas antes do node passar a mandar o campo.
update public.contas_a_receber
   set organizacao_id = '00000000-0000-0000-0000-000000000001'
 where organizacao_id is null;

update public.contas_pagas
   set organizacao_id = '00000000-0000-0000-0000-000000000001'
 where organizacao_id is null;

-- 2. RLS ligado + policy select-own-org (drop/create para ser idempotente).
alter table public.contas_a_receber enable row level security;
drop policy if exists "contas_a_receber_select_own_org" on public.contas_a_receber;
create policy "contas_a_receber_select_own_org" on public.contas_a_receber
  for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

alter table public.contas_pagas enable row level security;
drop policy if exists "contas_pagas_select_own_org" on public.contas_pagas;
create policy "contas_pagas_select_own_org" on public.contas_pagas
  for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

-- 3. Conferência (rodar separado, deve bater com o volume do ERP ~8,9k / ~3,2k
--    e sem_org = 0):
-- select 'contas_a_receber' as tabela, count(*) as total,
--        count(*) filter (where organizacao_id is null) as sem_org
--   from public.contas_a_receber
-- union all
-- select 'contas_pagas', count(*),
--        count(*) filter (where organizacao_id is null)
--   from public.contas_pagas;
