const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchView(view, select) {
  const { data, error } = await db.from(view).select(select || "*");
  if (error) throw new Error(`Falha ao consultar ${view}: ${error.message}`);
  return data || [];
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
// vw_kpis is a single pre-aggregated row with no date to filter by.
async function getResumoVendasRaw() {
  return fetchView("resumo_vendas", '"Data Venda","Valor Venda","Valor Recebido","Total a Receber"');
}
