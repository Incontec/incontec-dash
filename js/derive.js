// ── Derived/computed values from raw Supabase rows ────
const BANK_PALETTE = ["#6FE3A6", "#4FB888", "#3A8E69", "#2A6B4E", "#1D4D38", "#8FE8BC", "#59A57E", "#245A40"];

// Hashed by name (not list position) so a bank keeps the same color across
// charts, pages and paginated table slices.
function colorForBank(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return BANK_PALETTE[hash % BANK_PALETTE.length];
}

// "Participação"/"concentração" are shares of gross positive balances, not of
// the net total — some accounts carry a negative saldo (e.g. overdrafts/factoring),
// which would make a share-of-net-total percentage flip sign in a misleading way.
function computeBancoStats(bancos) {
  const saldoTotal = bancos.reduce((s, b) => s + (b.saldo || 0), 0);
  const totalPositivo = bancos.reduce((s, b) => s + Math.max(b.saldo || 0, 0), 0);
  const sorted = [...bancos].sort((a, b) => b.saldo - a.saldo);
  const bancoLider = sorted[0] || null;
  const bancoMenor = sorted[sorted.length - 1] || null;
  const concentracao = bancoLider && totalPositivo ? Math.round((Math.max(bancoLider.saldo, 0) / totalPositivo) * 100) : 0;
  return {
    saldoTotal,
    totalPositivo,
    bancoLider,
    bancoMenor,
    concentracao,
    qtdBancos: bancos.length,
    mediaPorBanco: bancos.length ? saldoTotal / bancos.length : 0,
  };
}

function participacaoPct(saldo, bancoStats) {
  if (!bancoStats.totalPositivo || saldo <= 0) return 0;
  return Math.round((saldo / bancoStats.totalPositivo) * 100);
}

// Effective due date of a parcela: a postponed one (data_prorrogacao) is due
// on the new date, not the original data_vencimento.
function vencimentoRecebivel(row) {
  return row.data_prorrogacao || row.data_vencimento || null;
}

function statusFromRecebivel(row) {
  const venc = vencimentoRecebivel(row);
  return venc && new Date(venc) < new Date() ? "Vencido" : "A vencer";
}

// `rows` here is every open parcela (vencido + a vencer). totalEmAberto sums
// all of them (mirrors Contas a Pagar's totalPagar); the other three fields
// are about the overdue subset only -- their labels say
// "vencido"/"inadimplentes"/"atraso".
function computeReceberSummary(rows) {
  const now = new Date();
  const totalEmAberto = rows.reduce((s, r) => s + (r.valor_parcela || 0), 0);
  const vencidos = rows.filter(r => statusFromRecebivel(r) === "Vencido");
  let totalVencido = 0;
  const clientes = new Set();
  let maiorAtraso = null;

  vencidos.forEach(r => {
    totalVencido += r.valor_parcela || 0;
    if (r.codigo_cliente != null) clientes.add(r.codigo_cliente);

    const venc = vencimentoRecebivel(r);
    if (venc) {
      const dias = Math.round((now - new Date(venc)) / 86400000);
      if (!maiorAtraso || dias > maiorAtraso.dias) {
        maiorAtraso = { cliente: r.cliente, dias, valor: r.valor_parcela || 0 };
      }
    }
  });

  return {
    totalEmAberto, totalVencido,
    vencidosCount: vencidos.length,
    clientesUnicos: clientes.size,
    maiorAtraso,
  };
}

// contas_pagar has no "paid" flag -- every row is a pending obligation, so
// status is purely a function of vencimento vs. today (unlike Contas a
// Receber, which distinguishes Pago/Vencido/A vencer via StatusVen).
function statusFromPagar(row) {
  return row.vencimento && new Date(row.vencimento) < new Date() ? "Vencido" : "A Vencer";
}

function computePagarSummary(rows) {
  const now = new Date();
  let totalPagar = 0, totalVencido = 0, vencidosCount = 0;
  const fornecedores = new Set();
  let proximoVencimento = null;

  rows.forEach(r => {
    const valor = r.valor_pagar || 0;
    totalPagar += valor;
    if (r.nominal) fornecedores.add(r.nominal);

    const venc = r.vencimento ? new Date(r.vencimento) : null;
    if (!venc) return;
    if (venc < now) {
      totalVencido += valor;
      vencidosCount++;
    } else if (!proximoVencimento || venc < proximoVencimento.data) {
      proximoVencimento = { data: venc, fornecedor: r.nominal, valor };
    }
  });

  return { totalPagar, totalVencido, vencidosCount, fornecedoresUnicos: fornecedores.size, proximoVencimento };
}

const MES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDateBR(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

// ── Period filter ("Tudo" vs. a date range) ────────────
// Bank balances (saldo_bancos, the Bancos page) are a snapshot, not a flow
// over time, so they're intentionally never filtered by period — only the
// activity data (sales, receivables, fluxo de caixa) responds to it.
function getPeriodRange(key) {
  const now = new Date();
  if (key === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (key === "year") return { from: new Date(now.getFullYear(), 0, 1), to: now };
  if (key === "12m" || key === "6m" || key === "3m") {
    const months = { "12m": 12, "6m": 6, "3m": 3 }[key];
    const from = new Date(now);
    from.setMonth(from.getMonth() - months);
    return { from, to: now };
  }
  return null; // "Tudo"
}

function inPeriod(dateStr, range) {
  if (!range) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= range.from && d <= range.to;
}

function computeKpisFiltered(resumoVendasRaw, fluxoCaixaRows, saldoBancos, range) {
  const vendas = resumoVendasRaw.filter(r => inPeriod(r["Data Venda"], range));
  const fluxo = fluxoCaixaRows.filter(r => inPeriod(r.Data, range));
  const valorVendido = vendas.reduce((s, r) => s + (r["Valor Venda"] || 0), 0);
  return {
    total_vendas: vendas.length,
    valor_vendido: valorVendido,
    valor_recebido: vendas.reduce((s, r) => s + (r["Valor Recebido"] || 0), 0),
    total_receber: vendas.reduce((s, r) => s + (r["Total a Receber"] || 0), 0),
    saldo_bancos: saldoBancos,
    total_fluxo: fluxo.length,
    // Average value per sale -- not "per unit": Qtd in resumo_vendas turned
    // out to be a row sequence number (1..2793, matching the table's row
    // count exactly), not a real quantity, so it can't back a per-unit ticket.
    ticket_medio: vendas.length ? valorVendido / vendas.length : 0,
  };
}
