-- RASCUNHO -- NAO RODAR EM PRODUCAO SEM VALIDAR CONTRA DADOS REAIS PRIMEIRO.
--
-- Objetivo: parar de confiar no campo "Pagar" de fluxo_caixa (que o node
-- BUSCAR FLUXO do n8n ja traz do ERP) e passar a calcular o lado "pagar"
-- a partir de contas_pagas (migration 010), que e a fonte de verdade pro
-- que ja foi efetivamente pago. O lado "Receber" continua vindo direto de
-- fluxo_caixa -- nao existe (por decisao do time) uma tabela raw separada
-- de "contas recebidas", entao nao ha de onde tirar receber senao dai.
--
-- fluxo_caixa continua sendo sincronizado do ERP exatamente como esta hoje
-- (node BUSCAR FLUXO / SALVAR SUPABASE4) -- esta migration so troca a
-- definicao das VIEWS que leem essa tabela, nao a tabela em si.
--
-- ── Checklist antes de rodar isto na VPS ───────────────────────────────
-- 1. Confirme que contas_pagas ja tem linhas reais (a migration 010 foi
--    aplicada e o branch BUSCAR Contas Pagas -> SALVAR SUPABASE5 ja rodou
--    pelo menos uma vez).
-- 2. Confirme se o valor em contas_pagas.obra bate com fluxo_caixa."Obra"
--    (mesmo texto, mesma grafia) -- rode:
--      select distinct obra from contas_pagas order by 1 limit 20;
--      select distinct "Obra" from fluxo_caixa order by 1 limit 20;
--    e compare visualmente. Se os nomes não baterem 1:1 (abreviacoes,
--    acentos diferentes etc.), o group by abaixo vai fragmentar o
--    resultado em vez de agregar corretamente.
-- 3. fluxo_caixa."Pessoa" nao tem equivalente direto confirmado em
--    contas_pagas -- assumi contas_pagas.nominal como o campo mais
--    proximo (é o nome do fornecedor/beneficiario do titulo pago).
--    Confirme com:
--      select distinct nominal from contas_pagas order by 1 limit 20;
--    contra os valores de "Pessoa" em fluxo_caixa antes de confiar em
--    vw_fluxo_pessoa depois desta troca.
-- 4. vw_fluxo_mensal e toda a familia ligada a resumo_vendas (vw_kpis,
--    vw_inadimplencia, vw_vendas_obra, vw_vendas_empresa, vw_top_clientes)
--    NAO estao nesta migration -- a definicao atual delas nunca foi
--    exportada pra este repositorio (foram criadas direto no Supabase
--    Dashboard). Antes de adapta-las do mesmo jeito, rode na VPS:
--      select pg_get_viewdef('public.vw_fluxo_mensal', true);
--      select pg_get_viewdef('public.vw_kpis', true);
--    (e as outras) pra ver a definicao real e decidir, view por view, se
--    o "Pagar"/"a receber" dela precisa trocar de fonte tambem. Eu não
--    tenho esse SQL aqui pra adaptar com seguranca.
-- 5. resumo_vendas especificamente: pra reconstrui-la em cima de
--    contas_a_receber (em vez de continuar sendo sua propria sincronizacao
--    do ERP), preciso saber se contas_a_receber tem uma coluna que ligue o
--    titulo a um cliente/venda (ex: um "Cliente" ou "ChaveVenda") -- sem
--    isso nao ha como agregar titulo -> cliente/obra do jeito que
--    resumo_vendas faz hoje. Confirme o schema real com:
--      select column_name from information_schema.columns
--      where table_name = 'contas_a_receber';
--    e me diga o resultado antes de eu desenhar essa parte.

create or replace view public.vw_fluxo_obra with (security_invoker = true) as
select f.obra,
       f.receber,
       coalesce(p.pago, 0) as pagar,
       f.receber - coalesce(p.pago, 0) as saldo
from (
  select "Obra" as obra, sum(coalesce("Receber", 0)) as receber
  from public.fluxo_caixa
  where "Obra" is not null
  group by "Obra"
) f
left join (
  select obra, sum(valor_pago) as pago
  from public.contas_pagas
  where obra is not null
  group by obra
) p on p.obra = f.obra;

create or replace view public.vw_fluxo_pessoa with (security_invoker = true) as
select f.pessoa,
       f.receber,
       coalesce(p.pago, 0) as pagar,
       f.receber - coalesce(p.pago, 0) as saldo
from (
  select "Pessoa" as pessoa, sum(coalesce("Receber", 0)) as receber
  from public.fluxo_caixa
  where "Pessoa" is not null
  group by "Pessoa"
) f
left join (
  select nominal, sum(valor_pago) as pago
  from public.contas_pagas
  where nominal is not null
  group by nominal
) p on p.nominal = f.pessoa;
