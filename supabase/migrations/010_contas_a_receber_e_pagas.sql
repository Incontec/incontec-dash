-- Tabelas para os dois branches novos do workflow "Projeto Final - Visconde":
-- BUSCAR Contas a Receber -> SALVAR SUPABASE3 -> contas_a_receber
-- BUSCAR Contas Pagas     -> SALVAR SUPABASE5 -> contas_pagas
--
-- Estrutura espelha contas_pagar (mesma origem ERP UAU, mesmo formato de
-- titulo). contas_pagas e a peca que faltava: contas_pagar so guarda titulos
-- em aberto (ver comentario em js/supabase-client.js:getContasPagar), sem
-- nenhum historico do que ja foi pago -- e a lacuna que a IA financeira
-- nao conseguia responder ("o que ja foi pago").
--
-- IMPORTANTE antes de rodar: os nomes de coluna abaixo sao um palpite por
-- simetria com contas_pagar (identificador, nominal, obra, vencimento,
-- tipo_conta, tipo, data_geracao) -- nao foi possivel confirmar contra a
-- resposta real dos nodes "BUSCAR Contas a Receber" / "BUSCAR Contas Pagas"
-- neste ambiente. Antes de configurar SALVAR SUPABASE3/SUPABASE5, execute
-- uma vez cada node BUSCAR isolado no n8n e confira o JSON retornado; ajuste
-- os nomes de coluna aqui (ou o mapeamento explicito no node SALVAR, como foi
-- feito para contas_pagar) se algum campo do ERP nao bater com o abaixo. O
-- jeito mais rapido de confirmar o schema depois de criado:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'contas_a_receber';

-- ── contas_a_receber: titulos a receber em aberto (nao e o mesmo dado de
-- resumo_vendas, que e por venda/cliente -- este e o titulo financeiro bruto
-- do ERP, mesmo par de dados que contas_pagar tem para o lado de pagar) ────
create table if not exists public.contas_a_receber (
  id serial primary key,
  identificador text,
  nominal text,
  obra text,
  descricao_obra text,
  vencimento date,
  valor_receber numeric,
  tipo_conta smallint,
  tipo smallint,
  data_geracao date,
  organizacao_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizacoes(id),
  created_at timestamptz not null default now()
);

alter table public.contas_a_receber enable row level security;
create policy "contas_a_receber_select_own_org" on public.contas_a_receber for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

-- Mesma licao de contas_pagar (009/README-sync.md): sem uma constraint unica,
-- o Prefer: resolution=merge-duplicates do PostgREST nao tem alvo de conflito
-- e cada sincronizacao duplica tudo. identificador sozinho se repete entre
-- obras -- a chave real e o conjunto abaixo.
alter table public.contas_a_receber add constraint contas_a_receber_linha_key
  unique (identificador, obra, vencimento, valor_receber, tipo_conta);

create index if not exists contas_a_receber_org_idx on public.contas_a_receber (organizacao_id);
create index if not exists contas_a_receber_vencimento_idx on public.contas_a_receber (vencimento);

-- Segue o padrao limpar_fluxo_caixa / limpar_resumo_vendas / limpar_saldo_contas
-- / limpar_contas_pagar (ver 009): o node AGENDAMENTO do branch chama isso via
-- rpc/limpar_contas_a_receber antes do BUSCAR repopular a tabela do zero.
create or replace function public.limpar_contas_a_receber()
returns void
language sql
security definer
as $function$
truncate table contas_a_receber restart identity;
$function$;

-- ── contas_pagas: historico de titulos ja efetivamente pagos. Diferente de
-- contas_pagar (so pendentes), cada linha aqui e um pagamento que ja
-- aconteceu, por isso tem valor_pago/data_pagamento em vez de so o valor
-- previsto -- esses dois podem divergir do vencimento/valor original por
-- juros, desconto ou pagamento parcial. ──────────────────────────────────
create table if not exists public.contas_pagas (
  id serial primary key,
  identificador text,
  nominal text,
  obra text,
  descricao_obra text,
  vencimento date,
  valor_pago numeric,
  data_pagamento date,
  tipo_conta smallint,
  tipo smallint,
  organizacao_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizacoes(id),
  created_at timestamptz not null default now()
);

alter table public.contas_pagas enable row level security;
create policy "contas_pagas_select_own_org" on public.contas_pagas for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

alter table public.contas_pagas add constraint contas_pagas_linha_key
  unique (identificador, obra, vencimento, valor_pago, data_pagamento);

create index if not exists contas_pagas_org_idx on public.contas_pagas (organizacao_id);
create index if not exists contas_pagas_data_pagamento_idx on public.contas_pagas (data_pagamento);

-- NAO chame isto a cada sincronizacao -- ao contrario de contas_pagar/
-- contas_a_receber (que sao "estado atual em aberto", entao truncar e
-- repopular e seguro: o que nao esta mais aberto e pra nao estar na tabela
-- mesmo), contas_pagas e HISTORICO acumulado. Se o node BUSCAR Contas Pagas
-- nao devolver todo o historico de pagamentos a cada execucao (so um lote
-- recente, por exemplo), truncar antes de repopular apagaria o historico
-- ja acumulado, deixando so o lote mais recente -- perda de dados
-- silenciosa. O node SALVAR SUPABASE5 deve inserir com
-- "Prefer: resolution=merge-duplicates" (mesmo header que contas_pagar ja
-- usa, ver n8n/README-sync.md) SEM um truncate antes -- a constraint unica
-- acima ja evita duplicar quem reaparecer numa proxima sincronizacao.
-- Mantenha esta funcao só para um rebuild manual e deliberado (ex: limpar
-- e reprocessar do zero se descobrir dados errados), nunca ligada ao
-- AGENDAMENTO do branch.
create or replace function public.limpar_contas_pagas()
returns void
language sql
security definer
as $function$
truncate table contas_pagas restart identity;
$function$;
