# Sincronização ERP → Supabase — workflow "Projeto Final - Visconde"

Workflow no n8n (`https://n8n.incontec.com.br/workflow/NLmnOLCbVcjzVURD-T1jZ`)
que puxa dados do ERP UAU (SeniorCloud) e grava em `fluxo_caixa`,
`saldo_contas` e `resumo_vendas` no Supabase.

## organizacao_id obrigatório

Desde a migração multi-tenant ([`supabase/migrations/001_multi_tenant.sql`](../supabase/migrations/001_multi_tenant.sql)),
essas 3 tabelas exigem `organizacao_id` (NOT NULL). Os 3 nós que gravam no
Supabase foram ajustados para sempre incluir esse campo, fixo por enquanto
com o id da Incontec (`00000000-0000-0000-0000-000000000001`):

- **SALVAR SUPABASE4** (`fluxo_caixa`) e **SALVAR SUPABASE** (`saldo_contas`)
  — usam "Specify Body: Using JSON", o campo `JSON` virou
  `{{$items().map(item => ({...item.json, organizacao_id: '00000000-0000-0000-0000-000000000001'}))}}`
- **SALVAR SUPABASE1** (`resumo_vendas`) — usa "Specify Body: Using Fields
  Below", ganhou um parâmetro novo `organizacao_id` = `00000000-0000-0000-0000-000000000001`
  na lista de Body Parameters.

Se um segundo cliente for adicionado, cada um desses 3 nós (num workflow de
sincronização próprio desse cliente) precisa apontar para o `organizacao_id`
dele, não o da Incontec.

## Cabeçalho X-INTEGRATION-Authorization

Os nós BUSCAR FLUXO / BUSCAR SALDO CONTAS / BUSCAR RESUMO VENDAS têm dois
headers de autenticação distintos:

- `Authorization` — token de sessão, dinâmico, `{{ $('LOGIN UAU*').first().json.data }}`
- `X-INTEGRATION-Authorization` — **token de integração, fixo** (não é o
  mesmo token de sessão). Estava com um valor antigo/expirado, causando
  `401 - Token de integração inválido!` só no BUSCAR FLUXO. Corrigido com o
  valor correto direto no n8n.

Não confundir os dois — só o `Authorization` deve reusar o login dinâmico.

## Volume de dados do BUSCAR FLUXO

`fluxo_caixa` recebe o histórico completo do ERP (sem filtro de período) —
isso é intencional, não um bug. Isso significa ~17-18 mil linhas por
sincronização completa.

Por causa desse volume, o node **Loop Over Items4** (que agrupa os inserts
em lotes antes de mandar pro Supabase) teve o **Batch Size reduzido de 100
para 25** — com 100, a execução chegou a crashar depois de ~2 minutos
processando os ~178 lotes. Se voltar a crashar, vale tentar um valor ainda
menor (10-15) ou investigar limites de memória/timeout do n8n.

## Retry

Os 3 nós BUSCAR* têm "Retry On Fail" habilitado (3 tentativas, 1s de
intervalo) para tolerar timeouts intermitentes do ERP.
