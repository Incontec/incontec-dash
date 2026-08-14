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

// Saldo Consolidado gets its own hero treatment (larger, top of the page) --
// it's the one number that summarizes all the others below it.
function renderDashboardHero(state) {
  const { kpis } = state;
  document.getElementById('dashHero').innerHTML = `
    <div class="dash-hero-icon">${I.wallet}</div>
    <div><div class="dash-hero-label">Saldo Consolidado</div><div class="dash-hero-value">${fmtBRLSigned(kpis.saldo_bancos)}</div></div>`;
}

function renderDashboardCards(state) {
  const { kpis, bancoStats } = state;
  renderMetricCards(document.getElementById('cards'), [
    { label:"Qtd. de Bancos",    value:bancoStats.qtdBancos,       ik:"landmark" },
    { label:"Total Vendido",     value:fmtBRLSigned(kpis.valor_vendido), ik:"bar" },
    { label:"Total a Receber",   value:fmtBRLRed(kpis.total_receber), ik:"gauge" },
    { label:"Banco Líder",       value:bancoStats.bancoLider ? bancoStats.bancoLider.Descri_banco : "—", ik:"trending", trend:bancoStats.concentracao },
    { label:"Ticket Médio",      value:fmtBRLSigned(kpis.ticket_medio), ik:"wallet" },
  ]);
}

// ── Contas a Receber ───────────────────────────────────
function renderReceberBanner(state) {
  const { summary } = state.receber;
  document.getElementById('banner-receber').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.arrowDown}</span>
    <span><span class="hi">Contas a Receber:</span> Total em aberto de <span class="val">${fmtBRLRed(summary.totalEmAberto)}</span>.
    <span class="warn">${summary.vencidosCount} título${summary.vencidosCount===1?'':'s'} vencido${summary.vencidosCount===1?'':'s'}</span> aguardando cobrança.</span>`;
}

function renderReceberTable(rows) {
  const statusColor = s => s==="Vencido" ? "#E38C8C" : s==="Pago" ? "#6FE3A6" : "#6AA9E3";
  const recTbody = document.getElementById('receber-tbody');
  recTbody.innerHTML = '';
  rows.forEach(r => {
    const status = statusFromRecebivel(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.Cliente}</td><td style="color:var(--muted)">${r.Obra}</td><td style="color:var(--muted)">${r["Data Venda"] || '—'}</td><td style="font-weight:500;color:${statusColor(status)}">${fmtBRL(r["Total a Receber"] || 0)}</td>
      <td style="white-space:nowrap"><span style="font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap;background:${statusColor(status)}22;color:${statusColor(status)}">${status}</span></td>`;
    recTbody.appendChild(tr);
  });
}

function renderReceberSummaryCards(state) {
  const s = state.receber.summary;
  document.getElementById('rec-total-valor').innerHTML = fmtBRLRed(s.totalVencido);
  document.getElementById('rec-total-sub').textContent = `${s.vencidosCount} título${s.vencidosCount===1?'':'s'} vencido${s.vencidosCount===1?'':'s'}`;
  document.getElementById('rec-clientes-valor').textContent = s.clientesUnicos;
  document.getElementById('rec-clientes-sub').textContent = `cliente${s.clientesUnicos===1?'':'s'} inadimplente${s.clientesUnicos===1?'':'s'}`;
  document.getElementById('rec-atraso-valor').textContent = s.maiorAtraso ? `${s.maiorAtraso.dias} d` : '—';
  document.getElementById('rec-atraso-sub').textContent = s.maiorAtraso ? s.maiorAtraso.cliente : '—';
}

// ── Contas a Pagar ─────────────────────────────────────
function renderPagarBanner(state) {
  const { summary } = state.pagar;
  document.getElementById('banner-pagar').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.arrowUp}</span>
    <span><span class="hi">Contas a Pagar:</span> Total em aberto de <span class="val">${fmtBRLRed(summary.totalPagar)}</span>.
    <span class="warn">${summary.vencidosCount} título${summary.vencidosCount===1?'':'s'} vencido${summary.vencidosCount===1?'':'s'}</span> aguardando pagamento.</span>`;
}

function renderPagarTable(rows) {
  const statusColor = s => s === "Vencido" ? "#E38C8C" : "#6AA9E3";
  const tbody = document.getElementById('pagar-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const status = statusFromPagar(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.nominal || '—'}</td><td style="color:var(--muted)">${r.obra || '—'}</td><td style="color:var(--muted)">${r.vencimento ? r.vencimento.slice(0,10) : '—'}</td><td style="font-weight:500;color:${statusColor(status)}">${fmtBRL(r.valor_pagar || 0)}</td>
      <td style="white-space:nowrap"><span style="font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap;background:${statusColor(status)}22;color:${statusColor(status)}">${status}</span></td>`;
    tbody.appendChild(tr);
  });
}

function renderPagarSummaryCards(state) {
  const s = state.pagar.summary;
  document.getElementById('pag-vencido-valor').innerHTML = fmtBRLRed(s.totalVencido);
  document.getElementById('pag-vencido-sub').textContent = `${s.vencidosCount} título${s.vencidosCount===1?'':'s'} vencido${s.vencidosCount===1?'':'s'}`;
  document.getElementById('pag-fornecedores-valor').textContent = s.fornecedoresUnicos;
  document.getElementById('pag-fornecedores-sub').textContent = `fornecedor${s.fornecedoresUnicos===1?'':'es'} com título${s.fornecedoresUnicos===1?'':'s'} em aberto`;
  document.getElementById('pag-proximo-valor').textContent = s.proximoVencimento ? fmtDateBR(s.proximoVencimento.data.toISOString().slice(0,10)) : '—';
  document.getElementById('pag-proximo-sub').textContent = s.proximoVencimento ? `${s.proximoVencimento.fornecedor} · ${fmtBRL(s.proximoVencimento.valor)}` : '—';
}

// ── Fluxo de Caixa ─────────────────────────────────────
function renderFluxoPage(state) {
  const { fluxoCaixa } = state;
  const entradas = fluxoCaixa.map(d => d.receber || 0);
  const saidas = fluxoCaixa.map(d => Math.abs(d.pagar || 0));
  const totalEntradas = entradas.reduce((a,b)=>a+b, 0);
  const totalSaidas = saidas.reduce((a,b)=>a+b, 0);
  // Média diária still divides by the count of days that actually had
  // movement (not the full calendar span) so weekends/no-activity days
  // don't dilute the average -- only the label shown to the user changes,
  // from that raw count to the human-readable date range it spans.
  const dias = fluxoCaixa.length;
  const brDate = iso => iso.split('-').reverse().join('/');
  const periodo = dias ? `${brDate(fluxoCaixa[0].Data)} a ${brDate(fluxoCaixa[dias-1].Data)}` : '—';

  document.getElementById('banner-fluxo').innerHTML = `
    <span style="color:var(--accent);flex-shrink:0;margin-top:2px;width:18px;height:18px">${I.wallet}</span>
    <span><span class="hi">Fluxo de Caixa:</span> saldo atual de <span class="val">${fmtBRLSigned(fluxoCaixa.length ? fluxoCaixa[fluxoCaixa.length-1].saldo_atual : 0)}</span>, no período de ${periodo}.</span>`;

  document.getElementById('fluxo-entradas-total').textContent = fmtBRL(totalEntradas);
  document.getElementById('fluxo-entradas-media').textContent = fmtBRL(dias ? totalEntradas/dias : 0);
  document.getElementById('fluxo-entradas-dias').textContent = periodo;

  document.getElementById('fluxo-saidas-total').textContent = fmtBRL(totalSaidas);
  document.getElementById('fluxo-saidas-media').textContent = fmtBRL(dias ? totalSaidas/dias : 0);
  document.getElementById('fluxo-saidas-dias').textContent = periodo;
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

// ── Fluxo de Caixa por Obra ────────────────────────────
function renderFluxoObraTable(rows) {
  const tbody = document.getElementById('fluxoobra-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.obra}</td><td style="color:var(--accent);white-space:nowrap">${fmtBRL(r.receber || 0)}</td><td style="color:#E38C8C;white-space:nowrap">${fmtBRL(r.pagar || 0)}</td>
      <td style="font-weight:500;white-space:nowrap">${fmtBRLSigned(r.saldo || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Vendas por Empresa ─────────────────────────────────
function renderVendasEmpresaTable(rows) {
  const tbody = document.getElementById('vendasempresa-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.Empresa}</td><td style="color:var(--muted)">${r.quantidade_vendas}</td><td style="font-weight:500;color:var(--accent)">${fmtBRL(r.valor_vendido || 0)}</td>
      <td style="color:var(--accent)">${fmtBRL(r.valor_recebido || 0)}</td><td style="color:#E38C8C">${fmtBRL(r.total_receber || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Bancos: per-account detail ─────────────────────────
function renderBancosDetalhadoTable(rows) {
  const tbody = document.getElementById('bancosdetalhe-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const cor = colorForBank(r.banco);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="banco-dot" style="background:${cor}"></span>${r.banco}</td><td style="color:var(--muted)">${r.conta || '—'}</td>
      <td style="font-weight:500">${fmtBRLSigned(r.saldo || 0)}</td><td style="color:var(--muted)">${r.data_saldo ? fmtDateBR(r.data_saldo) : '—'}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Fluxo de Caixa por Pessoa ───────────────────────────
function renderFluxoPessoaTable(rows) {
  const tbody = document.getElementById('fluxopessoa-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.pessoa}</td><td style="color:var(--accent);white-space:nowrap">${fmtBRL(r.receber || 0)}</td><td style="color:#E38C8C;white-space:nowrap">${fmtBRL(r.pagar || 0)}</td>
      <td style="font-weight:500;white-space:nowrap">${fmtBRLSigned(r.saldo || 0)}</td>`;
    tbody.appendChild(tr);
  });
}
