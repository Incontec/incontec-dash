const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PostgREST caps a single response at 1000 rows regardless of how big the
// table is (resumo_vendas alone has 2793) — paginate with .range() until a
// page comes back short, so every KPI computed from this data is accurate
// instead of silently truncated to the first 1000 rows.
async function fetchView(view, select) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await db.from(view).select(select || "*").range(from, from + pageSize - 1);
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

async function getFluxoMensal() {
  const rows = await fetchView("vw_fluxo_mensal");
  return rows.sort((a, b) => a.MonthNumber - b.MonthNumber);
}

async function getRecebiveis() {
  return fetchView("vw_inadimplencia");
}

async function getVendasObra() {
  const rows = await fetchView("vw_vendas_obra");
  return rows.sort((a, b) => b.valor_vendido - a.valor_vendido);
}

// Raw (per-sale) rows with their own date, used for the period filter —
// vw_kpis is a single pre-aggregated row with no date to filter by. Also
// doubles as the "Vendas" source for the custom report builder, hence the
// extra Cliente/Obra/status columns beyond what the period filter itself needs.
async function getResumoVendasRaw() {
  return fetchView("resumo_vendas", 'Cliente,Obra,"Data Venda","Valor Venda","Valor Recebido","Total a Receber",StatusVen,"Data Quitação"');
}

// contas_pagar holds only open/pending bills (that's what the ERP query
// already filters for) -- there's no "paid" flag, so every row is a current
// obligation, sorted soonest-due-first for a payables worklist.
async function getContasPagar() {
  const rows = await fetchView("contas_pagar", "nominal,obra,vencimento,valor_pagar,tipo_conta");
  return rows.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
}
