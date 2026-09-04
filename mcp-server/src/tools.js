import { z } from "zod";
import { fetchFromSupabase } from "./supabase.js";

const ORGANIZACAO_ID = process.env.ORGANIZACAO_ID;

function asResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Registers every finance tool on an McpServer instance. Kept as one
// function (rather than one file per tool) since they all share the same
// fetchFromSupabase() helper and there are only a handful of them.
export function registerTools(server) {
  server.registerTool(
    "consultar_kpis",
    {
      title: "Consultar KPIs financeiros",
      description:
        "Retorna o resumo executivo consolidado: saldo em bancos, total vendido, " +
        "total a receber, numero de vendas e ticket medio. Uma unica linha, sem filtros.",
      inputSchema: {},
    },
    async () => {
      const rows = await fetchFromSupabase("vw_kpis");
      return asResult(rows[0] || null);
    }
  );

  server.registerTool(
    "consultar_saldo_bancos",
    {
      title: "Consultar saldo por banco",
      description:
        "Retorna o saldo consolidado por instituicao bancaria. Use detalhado=true " +
        "para ver conta por conta (com data do snapshot) em vez de so o total por banco.",
      inputSchema: {
        detalhado: z.boolean().optional().describe("true para abrir por conta, nao so por banco"),
      },
    },
    async ({ detalhado }) => {
      const rows = await fetchFromSupabase(detalhado ? "vw_bancos_detalhado" : "vw_bancos");
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_fluxo_mensal",
    {
      title: "Consultar fluxo de caixa mensal",
      description:
        "Serie temporal de recebido/pago/saldo por mes (janela rolante de ~12 meses). " +
        "Use para perguntas sobre evolucao do caixa ao longo do tempo.",
      inputSchema: {},
    },
    async () => {
      const rows = await fetchFromSupabase("vw_fluxo_mensal");
      rows.sort((a, b) => String(a.month_start).localeCompare(String(b.month_start)));
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_fluxo_por_obra",
    {
      title: "Consultar fluxo de caixa por obra",
      description:
        "Recebido/pago/saldo agregado por obra (empreendimento). Use o parametro obra " +
        "para focar numa obra especifica (ex: perguntas do tipo 'como esta o caixa da obra X').",
      inputSchema: {
        obra: z.string().optional().describe("nome (ou parte do nome) da obra a filtrar"),
      },
    },
    async ({ obra }) => {
      const filters = obra ? [["Obra", "ilike", `*${obra}*`]] : [];
      const rows = await fetchFromSupabase("vw_fluxo_obra", { filters });
      rows.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_inadimplencia",
    {
      title: "Consultar inadimplencia",
      description:
        "Lista titulos vencidos (clientes inadimplentes), ordenados por maior valor em " +
        "atraso primeiro. Use limite para reduzir o tamanho da resposta (padrao: 20).",
      inputSchema: {
        limite: z.number().int().positive().max(500).optional(),
      },
    },
    async ({ limite }) => {
      const rows = await fetchFromSupabase("vw_inadimplencia", { limit: limite || 20 });
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_contas_a_pagar",
    {
      title: "Consultar contas a pagar",
      description:
        "Lista contas a pagar EM ABERTO (pendentes de pagamento). Para o que ja foi " +
        "pago, use consultar_contas_pagas em vez desta. Filtre por obra e/ou por uma " +
        "janela de vencimento (AAAA-MM-DD) para responder perguntas como 'o que vence " +
        "esse mes' ou 'quanto a obra X tem a pagar'.",
      inputSchema: {
        obra: z.string().optional().describe("nome (ou parte do nome) da obra a filtrar"),
        vencimento_de: z.string().optional().describe("data minima de vencimento, AAAA-MM-DD"),
        vencimento_ate: z.string().optional().describe("data maxima de vencimento, AAAA-MM-DD"),
        tipo_conta: z.string().optional().describe("filtra pelo tipo/categoria da conta"),
      },
    },
    async ({ obra, vencimento_de, vencimento_ate, tipo_conta }) => {
      const filters = [["organizacao_id", "eq", ORGANIZACAO_ID]];
      if (obra) filters.push(["obra", "ilike", `*${obra}*`]);
      if (vencimento_de) filters.push(["vencimento", "gte", vencimento_de]);
      if (vencimento_ate) filters.push(["vencimento", "lte", vencimento_ate]);
      if (tipo_conta) filters.push(["tipo_conta", "eq", tipo_conta]);
      const rows = await fetchFromSupabase("contas_pagar", {
        select: "identificador,nominal,obra,descricao_obra,vencimento,valor_pagar,tipo_conta,tipo,data_geracao",
        filters,
        order: "vencimento.asc",
      });
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_recebimentos_por_venda",
    {
      title: "Consultar recebimentos por venda/cliente",
      description:
        "Consulta vendas e seus recebimentos a partir do resumo de vendas (visao POR " +
        "VENDA/CLIENTE, com valor vendido, valor ja recebido, saldo a receber e status " +
        "de inadimplencia). Para os titulos financeiros brutos do ERP (visao por " +
        "titulo/duplicata), use consultar_titulos_a_receber. Filtre por cliente, obra " +
        "e/ou periodo da venda para perguntas especificas.",
      inputSchema: {
        cliente: z.string().optional().describe("nome (ou parte do nome) do cliente"),
        obra: z.string().optional().describe("nome (ou parte do nome) da obra"),
        apenas_inadimplentes: z.boolean().optional().describe("true para trazer so quem esta em atraso"),
        data_venda_de: z.string().optional().describe("data minima da venda, AAAA-MM-DD"),
        data_venda_ate: z.string().optional().describe("data maxima da venda, AAAA-MM-DD"),
        limite: z.number().int().positive().max(1000).optional(),
      },
    },
    async ({ cliente, obra, apenas_inadimplentes, data_venda_de, data_venda_ate, limite }) => {
      const filters = [["organizacao_id", "eq", ORGANIZACAO_ID]];
      if (cliente) filters.push(["Cliente", "ilike", `*${cliente}*`]);
      if (obra) filters.push(["Obra", "ilike", `*${obra}*`]);
      if (apenas_inadimplentes) filters.push(["Cliente Inadimplente", "eq", "Sim"]);
      if (data_venda_de) filters.push(["Data Venda", "gte", data_venda_de]);
      if (data_venda_ate) filters.push(["Data Venda", "lte", data_venda_ate]);
      const rows = await fetchFromSupabase("resumo_vendas", {
        select:
          'Cliente,Obra,"Data Venda","Valor Venda","Valor Recebido","Total a Receber",' +
          '"Cliente Inadimplente",Valor_Atraso,StatusVen,"Data Quitação"',
        filters,
        order: '"Data Venda".desc',
        limit: limite || 200,
      });
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_titulos_a_receber",
    {
      title: "Consultar titulos a receber (ERP)",
      description:
        "Lista titulos a receber EM ABERTO diretamente do ERP (tabela contas_a_receber, " +
        "espelhando contas_a_pagar). Diferente de consultar_recebimentos_por_venda (que " +
        "agrega por venda/cliente a partir do resumo de vendas), aqui cada linha e um " +
        "titulo/duplicata bruto. Filtre por obra e/ou janela de vencimento (AAAA-MM-DD).",
      inputSchema: {
        obra: z.string().optional().describe("nome (ou parte do nome) da obra a filtrar"),
        vencimento_de: z.string().optional().describe("data minima de vencimento, AAAA-MM-DD"),
        vencimento_ate: z.string().optional().describe("data maxima de vencimento, AAAA-MM-DD"),
        tipo_conta: z.string().optional().describe("filtra pelo tipo/categoria da conta"),
      },
    },
    async ({ obra, vencimento_de, vencimento_ate, tipo_conta }) => {
      const filters = [["organizacao_id", "eq", ORGANIZACAO_ID]];
      if (obra) filters.push(["obra", "ilike", `*${obra}*`]);
      if (vencimento_de) filters.push(["vencimento", "gte", vencimento_de]);
      if (vencimento_ate) filters.push(["vencimento", "lte", vencimento_ate]);
      if (tipo_conta) filters.push(["tipo_conta", "eq", tipo_conta]);
      const rows = await fetchFromSupabase("contas_a_receber", {
        select: "identificador,nominal,obra,descricao_obra,vencimento,valor_receber,tipo_conta,tipo,data_geracao",
        filters,
        order: "vencimento.asc",
      });
      return asResult(rows);
    }
  );

  server.registerTool(
    "consultar_contas_pagas",
    {
      title: "Consultar contas ja pagas",
      description:
        "Lista o HISTORICO de titulos ja pagos (tabela contas_pagas), com valor " +
        "efetivamente pago e data do pagamento -- diferente de consultar_contas_a_pagar, " +
        "que so mostra o que ainda esta pendente. Use para perguntas como 'quanto ja " +
        "pagamos esse mes' ou 'o que foi pago pra obra X'.",
      inputSchema: {
        obra: z.string().optional().describe("nome (ou parte do nome) da obra a filtrar"),
        pagamento_de: z.string().optional().describe("data minima do pagamento, AAAA-MM-DD"),
        pagamento_ate: z.string().optional().describe("data maxima do pagamento, AAAA-MM-DD"),
        tipo_conta: z.string().optional().describe("filtra pelo tipo/categoria da conta"),
      },
    },
    async ({ obra, pagamento_de, pagamento_ate, tipo_conta }) => {
      const filters = [["organizacao_id", "eq", ORGANIZACAO_ID]];
      if (obra) filters.push(["obra", "ilike", `*${obra}*`]);
      if (pagamento_de) filters.push(["data_pagamento", "gte", pagamento_de]);
      if (pagamento_ate) filters.push(["data_pagamento", "lte", pagamento_ate]);
      if (tipo_conta) filters.push(["tipo_conta", "eq", tipo_conta]);
      const rows = await fetchFromSupabase("contas_pagas", {
        select: "identificador,nominal,obra,descricao_obra,vencimento,valor_pago,data_pagamento,tipo_conta,tipo",
        filters,
        order: "data_pagamento.desc",
      });
      return asResult(rows);
    }
  );
}
