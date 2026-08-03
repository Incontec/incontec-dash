-- Multi-tenant setup for INCONTEC DASH
-- Applied directly via Supabase SQL Editor on 2026-08-03.
-- Adds an organizacao (tenant) layer on top of the existing single-client schema,
-- so the same fluxo_caixa/resumo_vendas/saldo_contas tables can serve multiple
-- companies, isolated via Row Level Security.

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

-- Seed the existing client with a fixed id so it's easy to reference elsewhere
-- (e.g. the n8n workflow's SALVAR SUPABASE nodes, once those become per-client).
insert into public.organizacoes (id, nome)
values ('00000000-0000-0000-0000-000000000001', 'Incontec')
on conflict (id) do nothing;

-- Links a Supabase Auth user to one organization. The dashboard frontend still
-- needs to add real login (Supabase Auth) for this to take effect end-to-end.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id),
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = auth.uid());

alter table public.fluxo_caixa add column if not exists organizacao_id uuid references public.organizacoes(id);
alter table public.resumo_vendas add column if not exists organizacao_id uuid references public.organizacoes(id);
alter table public.saldo_contas add column if not exists organizacao_id uuid references public.organizacoes(id);

update public.fluxo_caixa set organizacao_id = '00000000-0000-0000-0000-000000000001' where organizacao_id is null;
update public.resumo_vendas set organizacao_id = '00000000-0000-0000-0000-000000000001' where organizacao_id is null;
update public.saldo_contas set organizacao_id = '00000000-0000-0000-0000-000000000001' where organizacao_id is null;

alter table public.fluxo_caixa alter column organizacao_id set not null;
alter table public.resumo_vendas alter column organizacao_id set not null;
alter table public.saldo_contas alter column organizacao_id set not null;

create index if not exists fluxo_caixa_org_idx on public.fluxo_caixa (organizacao_id);
create index if not exists resumo_vendas_org_idx on public.resumo_vendas (organizacao_id);
create index if not exists saldo_contas_org_idx on public.saldo_contas (organizacao_id);

-- RLS was already enabled (no policies) on these 3 tables, so they were fully
-- locked down for anon/authenticated and only reachable through the views
-- below (which ran as the view owner, bypassing RLS). These policies make
-- each logged-in user see only their own organization's rows.
create policy "fluxo_caixa_select_own_org" on public.fluxo_caixa for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));
create policy "resumo_vendas_select_own_org" on public.resumo_vendas for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));
create policy "saldo_contas_select_own_org" on public.saldo_contas for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

-- Make the existing views respect the querying user's RLS instead of running
-- as the view owner (which bypasses RLS entirely by default in Postgres).
alter view public.vw_bancos set (security_invoker = true);
alter view public.vw_dashboard set (security_invoker = true);
alter view public.vw_fluxo_caixa set (security_invoker = true);
alter view public.vw_fluxo_mensal set (security_invoker = true);
alter view public.vw_ia set (security_invoker = true);
alter view public.vw_inadimplencia set (security_invoker = true);
alter view public.vw_kpis set (security_invoker = true);
alter view public.vw_top_clientes set (security_invoker = true);
alter view public.vw_vendas_empresa set (security_invoker = true);
alter view public.vw_vendas_obra set (security_invoker = true);
