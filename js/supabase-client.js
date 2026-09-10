const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PostgREST caps a single response at 1000 rows regardless of how big the
// table is (resumo_vendas alone has 2793) — paginate with .range() until a
// page comes back short, so every KPI computed from this data is accurate
// instead of silently truncated to the first 1000 rows.
async function fetchView(view, select, filterFn) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    let query = db.from(view).select(select || "*");
    if (filterFn) query = filterFn(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Falha ao consultar ${view}: ${error.message}`);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function getKpis() {
  const rows = await fetchView("vw_kpis");
  return rows[0] || null;
}

async function getBancos() {
  return fetchView("vw_bancos");
}

async function getFluxoCaixa() {
  const rows = await fetchView("vw_fluxo_caixa");
  return rows.sort((a, b) => a.Data.localeCompare(b.Data));
}

// Sorted by month_start (a real calendar date), not MonthNumber (1-12) --
// the view returns a rolling 12-month window, which crosses a year boundary
// as soon as more than a year of data exists, and MonthNumber alone can't
// tell Jan/2026 from Jan/2027 apart.
async function getFluxoMensal() {
  const rows = await fetchView("vw_fluxo_mensal");
  return rows.sort((a, b) => a.month_start.localeCompare(b.month_start));
}

// Per-installment receivables straight from the UAU "Contas a Receber"
// report (contas_a_receber table): one row per parcela, each with its own
// vencimento/prorrogação and valor. Replaced the resumo_vendas-derived
// version, which was sales-level and leaned on the ERP's "Cliente
// Inadimplente" flag rather than a real due date.
async function getRecebiveis() {
  return fetchView("contas_a_receber");
}

async function getVendasObra() {
  const rows = await fetchView("vw_vendas_obra");
  return rows.sort((a, b) => b.valor_vendido - a.valor_vendido);
}

// Aggregated server-side (view groups the 17k-row raw fluxo_caixa table by
// Obra) -- fetching the raw table client-side just to sum it in JS would
// mean paginating through every transaction for no benefit.
async function getFluxoObra() {
  const rows = await fetchView("vw_fluxo_obra");
  return rows.sort((a, b) => b.saldo - a.saldo);
}

async function getVendasEmpresa() {
  const rows = await fetchView("vw_vendas_empresa");
  return rows.sort((a, b) => b.valor_vendido - a.valor_vendido);
}

// Raw (per-sale) rows with their own date, used for the period filter —
// vw_kpis is a single pre-aggregated row with no date to filter by. Also
// doubles as the "Vendas" source for the custom report builder, hence the
// extra Cliente/Obra/status columns beyond what the period filter itself needs.
async function getResumoVendasRaw() {
  return fetchView("resumo_vendas", 'Cliente,Obra,"Data Venda","Valor Venda","Valor Recebido","Total a Receber",StatusVen,"Data Quitação"');
}

// Per-account detail behind vw_bancos (which only totals by bank name) --
// same latest-snapshot-per-account data, just not collapsed, so the Bancos
// page can show individual accounts and how fresh each balance is.
async function getBancosDetalhado() {
  const rows = await fetchView("vw_bancos_detalhado");
  return rows.sort((a, b) => (a.banco || '').localeCompare(b.banco || '') || b.saldo - a.saldo);
}

// Same shape as getFluxoObra but grouped by client instead of project --
// 1400+ rows, so this leans on the table's search/pagination rather than
// being skimmable at a glance.
async function getFluxoPessoa() {
  const rows = await fetchView("vw_fluxo_pessoa");
  return rows.sort((a, b) => b.saldo - a.saldo);
}

// contas_pagar holds only open/pending bills (that's what the ERP query
// already filters for) -- there's no "paid" flag, so every row is a current
// obligation, sorted soonest-due-first for a payables worklist.
async function getContasPagar() {
  const rows = await fetchView("contas_pagar", "nominal,obra,vencimento,valor_pagar,tipo_conta");
  return rows.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
}

// contas_pagas is the opposite side: bills already settled (payment history
// from the UAU "Contas Pagas" report), most-recently-paid first.
async function getContasPagas() {
  const rows = await fetchView("contas_pagas");
  return rows.sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || ''));
}
