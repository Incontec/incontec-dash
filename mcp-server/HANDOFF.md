# Handoff — colar numa sessão do Claude Code que rode na VPS

Esta sessão (a que gerou este arquivo) roda num container isolado na nuvem,
sem acesso à VPS do n8n nem ao Supabase. Para configurar o servidor MCP e
reconfigurar o workflow do n8n de verdade, é preciso abrir uma sessão do
Claude Code **na própria VPS** (onde o n8n já roda) e colar o texto abaixo
como primeira mensagem, pra dar contexto do que já foi feito.

---

Estou continuando o trabalho da branch `claude/teste-fe4ffc` do repo
`Incontec/incontec-dash`. Já existe, nessa branch:

- Um servidor MCP em `mcp-server/` (Node + `@modelcontextprotocol/sdk`,
  testado localmente contra um mock) que expõe os dados financeiros do
  Supabase como ferramentas para a IA: `consultar_kpis`,
  `consultar_saldo_bancos`, `consultar_fluxo_mensal`,
  `consultar_fluxo_por_obra`, `consultar_inadimplencia`,
  `consultar_contas_a_pagar`, `consultar_contas_pagas`,
  `consultar_titulos_a_receber`, `consultar_recebimentos_por_venda`.
- Uma migration `supabase/migrations/010_contas_a_receber_e_pagas.sql` com
  duas tabelas novas (`contas_a_receber`, `contas_pagas`) alimentadas por
  dois branches novos do workflow de sincronização "Projeto Final -
  Visconde" no n8n: node **BUSCAR Contas a Receber → SALVAR SUPABASE3** e
  node **BUSCAR Contas Pagas → SALVAR SUPABASE5**.
- Documentação completa em `mcp-server/README.md` (o que cada ferramenta
  faz, como rodar local, como integrar no n8n).

Preciso que você, com acesso real a esta VPS/n8n/Supabase, faça o seguinte:

1. **Confira os nomes de campo reais do ERP** antes de rodar a migration —
   abra os nodes **BUSCAR Contas a Receber** e **BUSCAR Contas Pagas** no
   editor do n8n, execute cada um isoladamente ("Test step") e veja o JSON
   retornado. Compare com as colunas em
   `supabase/migrations/010_contas_a_receber_e_pagas.sql` (o comentário no
   topo do arquivo explica o que pode não bater — mesmo tipo de ajuste que
   já foi necessário para `contas_pagar`, documentado em
   `n8n/README-sync.md`). Ajuste a migration se necessário.
2. **Rode a migration** no SQL Editor do Supabase (projeto já configurado em
   `js/config.js`).
3. **Suba o servidor MCP** nesta VPS:
   ```bash
   cd mcp-server
   npm install
   cp .env.example .env   # preencha SUPABASE_SERVICE_ROLE_KEY e gere um MCP_AUTH_TOKEN
   npm start              # ou configure como serviço permanente (pm2/systemd)
   ```
4. **Reconfigure o workflow "Incontec AI - Assistente Financeira"** no n8n
   seguindo o guia em `mcp-server/README.md` (seção "Integrando no workflow
   do n8n"): adicionar node MCP Client Tool + AI Agent, remover as buscas
   fixas antigas, testar com perguntas sobre contas a pagar/receber por obra.
5. Depois de configurar o node **AGENDAMENTO** dos dois branches novos,
   ligue-os para chamar `rpc/limpar_contas_a_receber` e
   `rpc/limpar_contas_pagas` antes do BUSCAR, do mesmo jeito que o branch de
   `contas_pagar` já faz (ver migration 009).

Ao final, teste o webhook de produção com uma pergunta que antes não dava
pra responder, tipo "quanto já pagamos pra Obra X esse mês" ou "quais
títulos a receber vencem essa semana", pra confirmar que o agente está
escolhendo a ferramenta certa.
