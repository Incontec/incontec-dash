# Sincronização ERP → Supabase — workflow "Projeto Final - Visconde"

Workflow no n8n (`https://n8n.incontec.com.br/workflow/NLmnOLCbVcjzVURD-T1jZ`)
que puxa dados do ERP UAU (SeniorCloud) e grava em `fluxo_caixa`,
`saldo_contas`, `resumo_vendas` e `contas_pagar` no Supabase.

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
