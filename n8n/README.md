# INCONTEC AI — workflow do n8n

A IA do dashboard usa um workflow no n8n do Incontec, chamado
**"Incontec AI - Assistente Financeira"**.

## Fluxo atual

```
Webhook (POST)
  ├→ Buscar dados (Supabase)   [vw_inadimplencia]        ─┐
  ├→ Buscar KPIs               [vw_kpis]                  │
  ├→ Buscar Bancos             [vw_bancos]                ├→ Merge (append, 5 inputs) → Montar contexto (Code)
  ├→ Buscar Fluxo Mensal       [vw_fluxo_mensal]           │     → Chamar Claude (HTTP Request)
  └→ Extrair Cliente (Code) → Buscar Vendas Cliente        │       → Code in JavaScript → Respond to Webhook
                               [resumo_vendas, filtrado]  ─┘
```

1. **Webhook** — recebe `{ "pergunta": "..." }` via POST. Sem autenticação
   (a URL em si, com um UUID aleatório, é o único "segredo").
2. **Cinco buscas em paralelo**, todas autenticadas via a credencial "Custom
   Auth account" (headers `apikey`/`Authorization` com a `service_role key`
   do Supabase — nunca a `anon key`, já que aqui a query roda no servidor):
   - **Buscar dados (Supabase)** — `vw_inadimplencia` (títulos vencidos).
   - **Buscar KPIs** — `vw_kpis` (saldo consolidado, total vendido/recebido/a
     receber, número de vendas).
   - **Buscar Bancos** — `vw_bancos` (saldo por banco).
   - **Buscar Fluxo Mensal** — `vw_fluxo_mensal` (recebido/pago/saldo por mês).
   - **Extrair Cliente (Code)** — regex simples sobre `pergunta` pega
     palavras capitalizadas que não estão numa lista de stopwords (Qual,
     Como, Cliente, Histórico, etc.) e monta `clienteBusca`. Alimenta
     **Buscar Vendas Cliente**, que consulta `resumo_vendas` com
     `Cliente=ilike.*{{ clienteBusca }}*` (limit 50) — devolve o histórico de
     vendas/pagamentos daquele cliente específico, se algum nome foi
     reconhecido na pergunta.
3. **Merge** (modo Append, 5 inputs) — só serve para sincronizar: garante que
   Montar contexto só roda depois que as 5 buscas terminaram. Sem ele, Montar
   contexto rodava assim que a busca mais rápida terminava e `$('NodeName')`
   de uma busca mais lenta ainda não executada, quebrava com
   "Node X hasn't been executed".
4. **Montar contexto (Code)** — busca cada fonte por nome via `$('Node
   Name')` (não usa o `items` genérico do Merge, já que a ordem/mistura dos 5
   branches não é previsível) e monta um texto único com: visão geral (KPIs),
   saldos por banco, evolução mensal, inadimplência (top 10 devedores) e,
   se houver `clienteBusca`, uma seção "HISTORICO DE PAGAMENTOS" com as
   vendas daquele cliente. Monta também `claudeBody` (JSON stringificado)
   para evitar problemas de escaping de aspas/quebras de linha.
5. **Chamar Claude (HTTP Request)** — POST para `api.anthropic.com/v1/messages`,
   corpo = `{{ $json.claudeBody }}`, modelo `claude-sonnet-5`. A chave da
   Anthropic está direto no header `x-api-key` deste nó (não numa credencial
   dedicada — ideal seria migrar para uma credencial Header Auth, mas
   funciona como está).
6. **Code in JavaScript** — a resposta da Anthropic pode vir com um bloco
   `thinking` antes do texto (não só `content[0]`), então o código busca o
   primeiro bloco com `type === 'text'` em vez de assumir `content[0].text`.
   Retorna `{ resposta: "..." }`.
7. **Respond to Webhook** — modo "First Incoming Item", devolve o item do
   passo anterior direto, sem template manual.

## URL de produção

Já configurada em [`js/config.js`](../js/config.js) (`N8N_WEBHOOK_URL`):

```
https://n8n.incontec.com.br/webhook/691d5bfd-e73f-4b59-9c0e-b26a298f6943
```

Timeout no frontend ([`js/ai-panel.js`](../js/ai-panel.js)): 30s — a
consulta às 5 fontes + chamada à Claude leva ~10-15s.

## Testar sem o dashboard

```bash
curl -X POST "https://n8n.incontec.com.br/webhook/691d5bfd-e73f-4b59-9c0e-b26a298f6943" \
  -H "Content-Type: application/json" \
  -d '{"pergunta":"Qual o histórico de pagamentos do Carlos Alberto Fruet?"}'
```

Deve retornar `{"resposta":"..."}`.

## Pontos de atenção para o futuro

- **Sem autenticação no webhook**: qualquer pessoa com a URL pode chamar e
  consumir crédito da API da Anthropic. Como o path é um UUID aleatório, não é
  adivinhável, mas para mais segurança dá para adicionar Header Auth no nó
  Webhook.
- **Chave da Anthropic em texto puro** no nó "Chamar Claude" (não numa
  credencial). Funciona, mas fica visível para quem tiver acesso de edição a
  esse workflow no n8n.
- **Reconhecimento de cliente é um heurístico simples** (regex de palavras
  capitalizadas menos stopwords) — não é NLP de verdade. Nomes com acentos ou
  totalmente minúsculos na pergunta podem não ser reconhecidos; nesse caso a
  seção de histórico simplesmente não aparece no contexto.
- **`resumo_vendas`, `vw_bancos`, etc. via PostgREST têm um teto de 1000
  linhas por requisição** — os nós HTTP deste workflow usam `limit` explícito
  abaixo desse teto (a busca de cliente usa `limit=50`, suficiente para o
  histórico de uma pessoa/empresa) para nunca precisar paginar. Se algum nó
  futuro precisar de mais de 1000 linhas de uma vez, vai truncar
  silenciosamente — o mesmo bug que foi corrigido do lado do dashboard em
  [`js/supabase-client.js`](../js/supabase-client.js) (`fetchView` agora
  pagina com `.range()`).
- Há também um branch de IA (AI Agent + ferramentas Supabase) que foi montado
  no workflow **"Projeto Final - Visconde"** durante a investigação inicial,
  antes de decidir usar o workflow dedicado acima. Ficou com o path do webhook
  renomeado para `incontec-ai-visconde-backup` (inativo, não interfere em
  nada) — pode ser removido com segurança se não for usado.
