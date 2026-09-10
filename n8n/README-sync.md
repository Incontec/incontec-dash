# Sincronização ERP → Supabase — workflow "Projeto Final - Visconde"

Workflow no n8n (`https://n8n.incontec.com.br/workflow/NLmnOLCbVcjzVURD-T1jZ`)
que puxa dados do ERP UAU (SeniorCloud) e grava em `fluxo_caixa`,
`saldo_contas`, `resumo_vendas`, `contas_pagar`, `contas_a_receber` e
`contas_pagas` no Supabase.

## Trigger `AGENDAMENTO` — branch Contas a Receber + Contas Pagas

Trigger separado dos demais (`AGENDAMENTO4` faz saldos/fluxo/resumo/contas a
pagar, `AGENDAMENTO6` faz os TRUNCATE). Duas ramificações:

- `LOGIN UAU6 → BUSCAR Contas a Receber → Loop Over Items2 (batch 25) →
  SALVAR SUPABASE3 → contas_a_receber` — ~8,9 mil linhas (uma por parcela),
  report UAU `{"Id": 25, "Personalizado": 1}`.
- `LOGIN UAU7 → BUSCAR Contas Pagas → Loop Over Items3 (batch 25) →
  SALVAR SUPABASE5 → contas_pagas` — ~3,2 mil linhas (uma por pagamento).

### Upsert de verdade — `?on_conflict=` na URL

Ambas as tabelas têm uma UNIQUE separada do PK (`id`):

| Tabela | Constraint | Colunas |
|---|---|---|
| `contas_a_receber` | `contas_a_receber_linha_key` | `empresa, obra, numer_venda, codigo_cliente, num_parc` |
| `contas_pagas` | `contas_pagas_linha_key` | `num_processo, empresa, obra, data_vencimento, valor` |

O `Prefer: resolution=merge-duplicates` sozinho **não basta**: o PostgREST
mira o PK (`id`), nunca casa, e a linha então estoura a UNIQUE → `409`
duplicate key em toda reexecução. A URL de cada node precisa carregar
`?on_conflict=<essas colunas>`:

```
.../rest/v1/contas_a_receber?on_conflict=empresa,obra,numer_venda,codigo_cliente,num_parc
.../rest/v1/contas_pagas?on_conflict=num_processo,empresa,obra,data_vencimento,valor
```

Com isso vira UPSERT real — sem precisar de TRUNCATE antes (essas duas
tabelas **não** entram no `AGENDAMENTO6`), sem 409, e linhas já existentes
são atualizadas em vez de puladas.

**Limitação conhecida:** como não há TRUNCATE, uma parcela que for
_cancelada_ no ERP (some do report) continua no `contas_a_receber` como se
estivesse em aberto. `contas_pagas` é histórico (append-only), então lá não
importa. Se isso virar problema, a opção é seguir o padrão das outras
tabelas: criar `rpc/limpar_contas_a_receber` + um node DELETE no
`AGENDAMENTO6`.

### Bugs corrigidos nesses 2 nodes (2026-09-10)

- **SALVAR SUPABASE3** apontava para `contas_pagar` (tabela errada) → `400
  PGRST204 "Could not find the 'cliente' column"`, zero linhas gravadas.
  Corrigido para `contas_a_receber`.
- Os dois nodes não tinham `?on_conflict=` → `409` em toda linha na segunda
  execução (ver acima). Corrigido.
- Os dois nodes não mandavam `organizacao_id` no body → as linhas entravam
  com org nula e a RLS do dashboard (sessão autenticada) não via nenhuma.
  Adicionado `"organizacao_id": "00000000-0000-0000-0000-000000000001"` no
  Body JSON, igual aos outros 4 SALVAR. Backfill das linhas antigas +
  policy em [`supabase/migrations/010_contas_a_receber_pagas_rls.sql`](../supabase/migrations/010_contas_a_receber_pagas_rls.sql).

### Colunas gravadas (Body JSON dos nodes)

- `contas_a_receber`: `empresa, obra, numer_venda, codigo_cliente, cliente,
  tipo_parc, num_parc, num_parc_geral, data_vencimento, data_prorrogacao,
  valor_parcela` (+ `organizacao_id`).
- `contas_pagas`: `num_processo, empresa, obra, banco, fornecedor,
  data_vencimento, data_pagamento, valor, status_pag, tipo_pagamento,
  desc_pagamento` (+ `organizacao_id`).

Ambas com RLS + policy select-own-org, mesmo padrão de
[`002_contas_pagar_rls.sql`](../supabase/migrations/002_contas_pagar_rls.sql).

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

## Branch Contas a Pagar

`LOGIN UAU5 → BUSCAR Contas a Pagar → Loop Over Items1 (batch 25) → SALVAR
SUPABASE2 → contas_pagar`. ~1407 linhas por sincronização completa.

### Nomes de campo do ERP não batem com as colunas do Supabase

Diferente das outras 3 tabelas (cujos nós SALVAR reusam os nomes de campo do
próprio ERP, mesmo inconsistentes), a tabela `contas_pagar` foi criada à parte
já em snake_case — então 4 dos 9 campos precisam de mapeamento explícito no
Body JSON de **SALVAR SUPABASE2**:

| Campo no ERP (BUSCAR Contas a Pagar) | Coluna no Supabase |
|---|---|
| `descricaoobra` | `descricao_obra` |
| `datageracao` | `data_geracao` |
| `valorpagar` | `valor_pagar` |
| `tipoconta` | `tipo_conta` |

Os outros 5 (`tipo`, `vencimento`, `nominal`, `identificador`, `obra`) batem
por coincidência (não têm underscore em nenhum dos dois lados). `tipo`
também precisa de `Number(...)` explícito — o ERP manda como string e a
coluna é `smallint`.

Esse mapeamento errado (usando os nomes do ERP direto, como nos outros 3
nós) gera `PGRST204 - Could not find the '<coluna>' column` no insert. A
forma mais rápida de confirmar o schema real de uma tabela é ir direto no
SQL Editor do Supabase Dashboard e rodar:
```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'contas_pagar'
order by ordinal_position;
```
— bem mais confiável do que tentar inferir por tentativa e erro via os erros
do PGRST204 (o erro reportado não segue uma ordem previsível quando há mais
de um campo inválido de uma vez).

### organizacao_id é opcional nessa tabela

Ao contrário das outras 3 (`NOT NULL`), `contas_pagar.organizacao_id` é
nullable. Mesmo assim o node preenche com o id fixo da Incontec
(`00000000-0000-0000-0000-000000000001`), pelo mesmo motivo das outras: se
um segundo cliente for adicionado, precisa apontar pro `organizacao_id` dele.

### Faltava constraint única — causou duplicação

`contas_pagar` só tinha `PRIMARY KEY (id)` (serial), sem nenhuma constraint
única equivalente à `resumo_vendas_ChaveVenda_key` das outras tabelas. Como
o `Prefer: resolution=merge-duplicates` do PostgREST só faz upsert de
verdade quando existe uma constraint única pra servir de alvo do conflito,
sem ela cada execução do node **insere de novo**, duplicando tudo — foi
assim que uma sincronização de teste (100 linhas) mais uma completa (1407)
viraram 1507 linhas na tabela, ao invés de 1407.

`identificador` sozinho **não** é uma chave natural válida — é um id de
"processo" que se repete entre `obra`s diferentes (um mesmo processo pode
gerar uma linha de conta a pagar por obra vinculada). A chave real é o
conjunto:

```sql
alter table contas_pagar add constraint contas_pagar_linha_key
  unique (identificador, obra, vencimento, valor_pagar, tipo_conta);
```

Com essa constraint em vigor, reexecuções futuras do workflow batem em
`409` para linhas já existentes — como **SALVAR SUPABASE2** tem `On Error:
Continue` (mesmo padrão do SALVAR SUPABASE1), esses conflitos são
ignorados silenciosamente em vez de duplicar ou derrubar a execução.

### Batch size

**Loop Over Items1** foi criado com Batch Size 100 (padrão do node) e
reduzido pra **25** preventivamente, replicando o ajuste que já tinha sido
necessário no Loop Over Items4 (ver seção "Volume de dados do BUSCAR
FLUXO" acima) — não chegou a crashar com 1407 itens, mas o volume é grande
o bastante pra valer a mesma cautela.
