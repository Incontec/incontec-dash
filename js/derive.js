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

function statusFromRecebivel(row) {
  return row["Cliente Inadimplente"] === "Sim" ? "Vencido" : "A vencer";
}

// `rows` here is every open receivable (vencido + a vencer) so the table can
// show both, but these three summary cards are specifically about the overdue
// subset -- their labels say "vencido"/"inadimplentes"/"atraso" -- so they
// filter back down to that before totaling.
function computeReceberSummary(rows) {
  const now = new Date();
  const vencidos = rows.filter(r => r["Cliente Inadimplente"] === "Sim");
  let totalAberto = 0;
  const clientes = new Set();
  let maiorAtraso = null;

  vencidos.forEach(r => {
    const aReceber = r["Total a Receber"] || 0;
    totalAberto += aReceber;
    if (r.Cliente) clientes.add(r.Cliente);

    if (r["Data Venda"]) {
      const dias = Math.round((now - new Date(r["Data Venda"])) / 86400000);
      if (!maiorAtraso || dias > maiorAtraso.dias) {
        maiorAtraso = { cliente: r.Cliente, dias, valor: aReceber };
      }
    }
  });

  return {
    totalAberto,
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

// Only counts sales that were actually paid (a real Data Quitação) --
// falling back to "today" for still-open receivables would measure how
// overdue they currently are, not how long payment actually takes, which
// skews the average toward whatever's oldest and unpaid rather than
// reflecting real collection speed.
function computePMR(rows) {
  const pagas = rows.filter(r => r["Data Venda"] && r["Data Quitação"]);

  // Some Data Quitação values are shared by an implausibly large batch of
  // sales (e.g. 353 unrelated sales all "quitadas" on the same day) -- a
  // sign of a bulk/system-migration write rather than real individual
  // payment dates. Left in, a few such dates dominate the average. A small
  // cluster (a handful to a few dozen sales settled around the same
  // month-end due date) is normal and stays; only the extreme outliers,
  // well beyond that range, are dropped.
  const porData = new Map();
  pagas.forEach(r => porData.set(r["Data Quitação"], (porData.get(r["Data Quitação"]) || 0) + 1));
  const datasEmLote = new Set([...porData].filter(([, n]) => n > 30).map(([data]) => data));

  const withDays = pagas
    .filter(r => !datasEmLote.has(r["Data Quitação"]))
    .map(r => {
      const start = new Date(r["Data Venda"]);
      const end = new Date(r["Data Quitação"]);
      const days = Math.round((end - start) / 86400000);
      return days >= 0 ? { start, days } : null;
    })
    .filter(Boolean);

  if (!withDays.length) return { avgDays: null, monthly: [] };

  const avgDays = Math.round(withDays.reduce((s, x) => s + x.days, 0) / withDays.length);

  const byMonth = new Map();
  withDays.forEach(({ start, days }) => {
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(days);
  });

  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, arr]) => ({
      mes: MES_LABEL[Number(key.split("-")[1]) - 1],
      dias: Math.round(arr.reduce((s, d) => s + d, 0) / arr.length),
    }));

  return { avgDays, monthly };
}

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
  return {
    total_vendas: vendas.length,
    valor_vendido: vendas.reduce((s, r) => s + (r["Valor Venda"] || 0), 0),
    valor_recebido: vendas.reduce((s, r) => s + (r["Valor Recebido"] || 0), 0),
    total_receber: vendas.reduce((s, r) => s + (r["Total a Receber"] || 0), 0),
    saldo_bancos: saldoBancos,
    total_fluxo: fluxo.length,
  };
}
