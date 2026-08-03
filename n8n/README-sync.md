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

Os nós BUSCAR FLUXO / BUSCAR SALDO CONTAS / BUSCAR RESUMO VENDAS reusam o
token de sessão do login (`{{ $('LOGIN UAU*').first().json.data }}`) tanto no
header `Authorization` quanto no `X-INTEGRATION-Authorization`. Esse segundo
header estava fixo (JWT expirado, hardcoded) e foi corrigido para usar a
mesma expressão dinâmica.

**BUSCAR FLUXO ainda falha** com `401 - Token de integração inválido!` mesmo
com o token correto — parece ser uma permissão específica do usuário do
LOGIN UAU1 no ERP, não um problema de configuração do n8n. Precisa confirmar
com o suporte do UAU/SeniorCloud se esse usuário tem acesso à consulta de
fluxo de caixa.

## Retry

Os 3 nós BUSCAR* têm "Retry On Fail" habilitado (3 tentativas, 1s de
intervalo) para tolerar timeouts intermitentes do ERP.
