# Servidor MCP financeiro

Servidor [MCP](https://modelcontextprotocol.io) que expõe os dados financeiros
do Supabase como ferramentas que um modelo pode chamar dinamicamente, em vez
do workflow do n8n buscar sempre as mesmas 5 views fixas antes de falar com o
Claude (ver [`../n8n/README.md`](../n8n/README.md) para o fluxo atual).

## Por que isso existe

O workflow "Incontec AI - Assistente Financeira" hoje monta o contexto do
Claude a partir de `vw_kpis`, `vw_bancos`, `vw_fluxo_mensal`, `vw_inadimplencia`
e (via um regex simples de nome) `resumo_vendas` filtrado por cliente. Isso
deixa de fora `contas_pagar` inteiramente e não permite filtrar `resumo_vendas`
por obra, período ou status — perguntas como "quanto a Obra X tem a pagar esse
mês" não tinham como ser respondidas.

Com MCP, o Claude ganha ferramentas e decide sozinho quais chamar e com quais
filtros, em vez de receber um bloco de texto fixo pré-montado.

## Ferramentas expostas

| Ferramenta | Fonte | Filtros |
|---|---|---|
| `consultar_kpis` | `vw_kpis` | — |
| `consultar_saldo_bancos` | `vw_bancos` / `vw_bancos_detalhado` | `detalhado` |
| `consultar_fluxo_mensal` | `vw_fluxo_mensal` | — |
| `consultar_fluxo_por_obra` | `vw_fluxo_obra` | `obra` |
| `consultar_inadimplencia` | `vw_inadimplencia` | `limite` |
| `consultar_contas_a_pagar` | `contas_pagar` | `obra`, `vencimento_de`, `vencimento_ate`, `tipo_conta` |
| `consultar_contas_a_receber` | `resumo_vendas` | `cliente`, `obra`, `apenas_inadimplentes`, `data_venda_de`, `data_venda_ate` |

**Limitação atual:** `contas_pagar` só guarda contas em aberto — não existe
histórico de contas já pagas (o ERP UAU já filtra só pendentes na sincronização,
ver [`../n8n/README-sync.md`](../n8n/README-sync.md)). Se o time quiser
perguntar "o que já foi pago", a sincronização do n8n precisa trazer esse
histórico do ERP antes que uma ferramenta `consultar_contas_pagas` faça sentido.

**Multi-tenant:** o servidor roda com a `service_role key`, que ignora RLS.
`consultar_contas_a_pagar` e `consultar_contas_a_receber` filtram explicitamente
por `ORGANIZACAO_ID` porque essas tabelas têm essa coluna. As views (`vw_*`)
não são filtradas no código — hoje existe só uma organização (Incontec), então
não há vazamento na prática, mas se um segundo cliente for adicionado, seria
necessário confirmar se cada view já filtra por `organizacao_id` internamente
(consultar a definição da view no Supabase) antes de reusar este servidor para
múltiplos tenants.

## Rodando localmente

```bash
cd mcp-server
npm install
cp .env.example .env   # preencha SUPABASE_SERVICE_ROLE_KEY e MCP_AUTH_TOKEN
npm start
```

Servidor sobe em `http://localhost:8787/mcp` (transporte MCP Streamable HTTP,
modo stateless — uma instância nova por requisição, sem sessão persistente).

Testar com curl:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploy

Ainda não decidido onde vai rodar em produção. Funciona como qualquer app
Node/Express: precisa ficar acessível por HTTP a partir do n8n (mesma VPS,
Supabase Edge Function, Vercel/Cloudflare, etc.), com `SUPABASE_SERVICE_ROLE_KEY`
e `MCP_AUTH_TOKEN` configurados como variáveis de ambiente do serviço — nunca
comitados. Gere o `MCP_AUTH_TOKEN` com algo como `openssl rand -hex 32`.

## Integrando no workflow do n8n

O objetivo é manter o contrato do webhook que o frontend já chama
(`{"pergunta": "..."}` → `{"resposta": "..."}`, ver
[`../js/ai-panel.js`](../js/ai-panel.js)) intacto, só trocando o miolo do
workflow:

**Fluxo atual:**
```
Webhook → 5 buscas fixas no Supabase → Merge → Montar contexto (Code)
        → Chamar Claude (HTTP Request) → Code in JavaScript → Respond to Webhook
```

**Fluxo novo:**
```
Webhook → AI Agent (Claude) + MCP Client Tool → Code in JavaScript → Respond to Webhook
```

Passos no editor do n8n:

1. Adicione um node **MCP Client Tool** (nodes da categoria LangChain/AI).
   Configure:
   - **SSE/HTTP Streamable Endpoint**: a URL pública do servidor, ex.
     `https://<host>/mcp`.
   - **Authentication**: Header Auth, `Authorization: Bearer <MCP_AUTH_TOKEN>`.
2. Adicione um node **AI Agent**, com:
   - **Chat Model**: Anthropic Chat Model, `claude-sonnet-5` (mesma credencial
     que já existe para a chamada HTTP direta — vale migrar a chave da
     Anthropic para essa credencial dedicada em vez de deixá-la em texto puro
     no node antigo, ponto já levantado em `../n8n/README.md`).
   - **Tools**: conecte o MCP Client Tool do passo 1.
   - **Prompt/Text**: `{{ $json.pergunta }}` (o corpo recebido pelo Webhook).
   - **System Message**: oriente o agente a responder em português, usar as
     ferramentas disponíveis para buscar dados antes de responder perguntas
     financeiras, e ser direto/executivo no tom (mesmo estilo das respostas
     atuais).
3. Remova (ou desative) os nodes antigos: as 5 buscas fixas, o Merge, o
   "Montar contexto" e o node HTTP "Chamar Claude" — o AI Agent substitui
   todos eles.
4. Mantenha (ou adapte) o node **Code in JavaScript** final para extrair o
   texto da resposta do AI Agent e devolver `{ resposta: "..." }`, e o
   **Respond to Webhook** como está.
5. Teste com a mesma pergunta usada no README do n8n
   (`"Qual o histórico de pagamentos do Carlos Alberto Fruet?"`) e com uma
   nova, específica de contas a pagar/receber por obra
   (ex.: `"Quanto a Obra X tem a pagar esse mês?"`), para confirmar que o
   agente está escolhendo a ferramenta certa.

Esse arquivo de workflow do n8n não é versionado neste repositório (só a
documentação, como já era o caso antes) — a mudança acontece direto no editor
do n8n.
