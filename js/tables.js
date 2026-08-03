function renderMetricCards(containerEl, items) {
  containerEl.innerHTML = '';
  items.forEach(m => {
    const badge = m.trend !== undefined ? `<span class="badge ${m.trend>=0?'pos':'neg'}">${m.trend>=0?'+':''}${m.trend}%</span>` : '';
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="card-top"><div class="card-icon">${I[m.ik]}</div>${badge}</div>
      <div><div class="card-label">${m.label}</div><div class="card-value">${m.value}</div></div>`;
    containerEl.appendChild(d);
  });
}

function emptyStateHtml(title, desc) {
  return `<div class="coming-soon">
    <div class="cs-icon">${I.alert}</div>
    <div class="cs-title">${title}</div>
    <div class="cs-desc">${desc}</div>
  </div>`;
}

// ── Dashboard: banner + cards ─────────────────────────
function renderBanner(state) {
  const { kpis, bancoStats } = state;
  const warnHtml = bancoStats.concentracao > 40
    ? `<span class="warn">${I.alert} Atenção à concentração bancária.</span>`
    : 'Nenhum risco crítico identificado.';
  document.getElementById('banner').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.trending}</span>
    <span><span class="hi">Resumo executivo:</span> saldo consolidado de <span class="val">${fmtBRLSigned(kpis.saldo_bancos)}</span>.
    ${bancoStats.bancoLider ? `${bancoStats.bancoLider.Descri_banco} concentra <span class="val">${bancoStats.concentracao}%</span> dos recursos.` : ''} ${warnHtml}</span>`;
}

function renderDashboardCards(state) {
  const { kpis, bancoStats } = state;
  renderMetricCards(document.getElementById('cards'), [
    { label:"Saldo Consolidado", value:fmtBRLSigned(kpis.saldo_bancos), ik:"wallet" },
    { label:"Qtd. de Bancos",    value:bancoStats.qtdBancos,       ik:"landmark" },
    { label:"Total Vendido",     value:fmtBRLSigned(kpis.valor_vendido), ik:"bar" },
    { label:"Total a Receber",   value:fmtBRLRed(kpis.total_receber), ik:"gauge" },
    { label:"Banco Líder",       value:bancoStats.bancoLider ? bancoStats.bancoLider.Descri_banco : "—", ik:"trending", trend:bancoStats.concentracao },
  ]);
}

// ── Contas a Receber ───────────────────────────────────
function renderReceberBanner(state) {
  const { summary } = state.receber;
  document.getElementById('banner-receber').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.arrowDown}</span>
    <span><span class="hi">Contas a Receber:</span> Total em aberto de <span class="val">${fmtBRLRed(summary.totalAberto)}</span>.
    <span class="warn">${summary.vencidosCount} título${summary.vencidosCount===1?'':'s'} vencido${summary.vencidosCount===1?'':'s'}</span> aguardando cobrança.</span>`;
}

function renderReceberTable(rows) {
  const statusColor = s => s==="Vencido" ? "#E38C8C" : s==="Pago" ? "#6FE3A6" : "#E3C26A";
  const recTbody = document.getElementById('receber-tbody');
  recTbody.innerHTML = '';
  rows.forEach(r => {
    const status = statusFromRecebivel(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.Cliente}</td><td style="color:var(--muted)">${r.Obra}</td><td style="color:var(--muted)">${r["Data Venda"] || '—'}</td><td style="font-weight:500;color:#E38C8C">${fmtBRL(r["Total a Receber"] || 0)}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${statusColor(status)}22;color:${statusColor(status)}">${status}</span></td>`;
    recTbody.appendChild(tr);
  });
}

function renderReceberSummaryCards(state) {
  const s = state.receber.summary;
  document.getElementById('rec-total-valor').innerHTML = fmtBRLSigned(s.totalAberto);
  document.getElementById('rec-total-sub').textContent = `${s.vencidosCount} título${s.vencidosCount===1?'':'s'} vencido${s.vencidosCount===1?'':'s'}`;
  document.getElementById('rec-clientes-valor').textContent = s.clientesUnicos;
  document.getElementById('rec-clientes-sub').textContent = `cliente${s.clientesUnicos===1?'':'s'} inadimplente${s.clientesUnicos===1?'':'s'}`;
  document.getElementById('rec-atraso-valor').textContent = s.maiorAtraso ? `${s.maiorAtraso.dias} d` : '—';
  document.getElementById('rec-atraso-sub').textContent = s.maiorAtraso ? s.maiorAtraso.cliente : '—';
}

// ── Contas a Pagar ─────────────────────────────────────
function renderPagarEmptyState() {
  document.getElementById('pagar-content').innerHTML = emptyStateHtml(
    "Nenhuma fonte de dados conectada",
    "Contas a Pagar ainda não tem uma tabela ou view no Supabase alimentada pelo ERP. Assim que houver dados de fornecedores/pagamentos, esta página passa a funcionar como as demais."
  );
}

// ── Fluxo de Caixa ─────────────────────────────────────
function renderFluxoPage(state) {
  const { fluxoCaixa } = state;
  const entradas = fluxoCaixa.map(d => d.receber || 0);
  const saidas = fluxoCaixa.map(d => Math.abs(d.pagar || 0));
  const totalEntradas = entradas.reduce((a,b)=>a+b, 0);
  const totalSaidas = saidas.reduce((a,b)=>a+b, 0);
  const dias = fluxoCaixa.length;

  document.getElementById('banner-fluxo').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.wallet}</span>
    <span><span class="hi">Fluxo de Caixa:</span> saldo atual de <span class="val">${fmtBRLSigned(fluxoCaixa.length ? fluxoCaixa[fluxoCaixa.length-1].saldo_atual : 0)}</span> ao longo de ${dias} dias com dados.</span>`;

  document.getElementById('fluxo-entradas-total').textContent = fmtBRL(totalEntradas);
  document.getElementById('fluxo-entradas-media').textContent = fmtBRL(dias ? totalEntradas/dias : 0);
  document.getElementById('fluxo-entradas-dias').textContent = dias;

  document.getElementById('fluxo-saidas-total').textContent = fmtBRL(totalSaidas);
  document.getElementById('fluxo-saidas-media').textContent = fmtBRL(dias ? totalSaidas/dias : 0);
  document.getElementById('fluxo-saidas-dias').textContent = dias;
}

// ── Bancos page ────────────────────────────────────────
function renderBancosCards(state) {
  const { bancoStats } = state;
  renderMetricCards(document.getElementById('banco-cards'), [
    { label:"Saldo Total",         value:fmtBRLSigned(bancoStats.saldoTotal),   ik:"wallet" },
    { label:"Qtd. Bancos",         value:bancoStats.qtdBancos,             ik:"landmark" },
    { label:"Banco Líder",         value:bancoStats.bancoLider ? bancoStats.bancoLider.Descri_banco : "—", ik:"trending", trend:bancoStats.concentracao },
    { label:"Média por Banco",     value:fmtBRLSigned(bancoStats.mediaPorBanco), ik:"gauge" },
    { label:"Menor Saldo",         value:bancoStats.bancoMenor ? bancoStats.bancoMenor.Descri_banco : "—", ik:"bar" },
  ]);
}

function renderBancosTable(bancos, bancoStats) {
  const bancosTbody = document.getElementById('bancos-tbody');
  bancosTbody.innerHTML = '';
  bancos.forEach(b => {
    const pct = participacaoPct(b.saldo, bancoStats);
    const cor = colorForBank(b.Descri_banco);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="banco-dot" style="background:${cor}"></span>${b.Descri_banco}</td>
      <td style="font-weight:500;color:var(--accent)">${fmtBRLSigned(b.saldo)}</td>
      <td style="min-width:120px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">${pct}%</div>
        <div class="prog-bar"><div class="prog-fill" style="width:${Math.max(pct,0)}%;background:${cor}"></div></div></td>`;
    bancosTbody.appendChild(tr);
  });
}

// ── Indicadores page ───────────────────────────────────
function renderIndicadoresCards(state) {
  const { pmr } = state;
  const indGrid = document.getElementById('ind-grid');
  indGrid.innerHTML = '';
  if (pmr.avgDays !== null) {
    const d = document.createElement('div');
    d.className = 'ind-card';
    d.innerHTML = `<div class="ind-label">Prazo Médio de Recebimento</div><div class="ind-value">${pmr.avgDays} d</div><div class="ind-sub">Calculado a partir de vw_inadimplencia</div>`;
    indGrid.appendChild(d);
  }
  const note = document.createElement('div');
  note.className = 'ind-card';
  note.innerHTML = `<div class="ind-label">Demais indicadores</div><div style="font-size:13px;color:var(--muted);line-height:1.6;margin-top:4px">Liquidez, Endividamento e Margem Operacional exigem dados de balanço patrimonial, ainda não conectados no Supabase.</div>`;
  indGrid.appendChild(note);
}
