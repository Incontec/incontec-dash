// ── Nav ───────────────────────────────────────────────
const NAV = [
  { label:"Dashboard",        iconKey:"dashboard", subtitle:"Visão consolidada de bancos e contas" },
  { label:"Fluxo de Caixa",   iconKey:"wallet",    subtitle:"Entradas e saídas previstas" },
  { label:"Contas a Receber", iconKey:"arrowDown", subtitle:"Recebíveis em aberto" },
  { label:"Contas a Pagar",   iconKey:"arrowUp",   subtitle:"Obrigações pendentes" },
  { label:"Bancos",           iconKey:"landmark",  subtitle:"Saldos por instituição financeira" },
  { label:"Relatórios",       iconKey:"bar",       subtitle:"Exportações e históricos" },
  { label:"Indicadores",      iconKey:"gauge",     subtitle:"Métricas estratégicas" },
  { label:"INCONTEC AI",      iconKey:"sparkles",  subtitle:"Assistente financeiro inteligente" },
];

let activeLabel = "Dashboard";

function setActive(label) {
  activeLabel = label;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + label);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    const isActive = b.dataset.label === label;
    b.classList.toggle('active', isActive);
    b.innerHTML = `
      ${isActive ? '<span class="active-bar"></span>' : ''}
      <span class="nav-icon" style="color:${isActive?'var(--accent)':'var(--muted)'}">${I[NAV.find(n=>n.label===b.dataset.label).iconKey]}</span>
      <span style="flex:1">${b.dataset.label}</span>
      ${isActive ? '<span class="nav-dot"></span>' : ''}
    `;
  });
  document.querySelectorAll('.mobile-tab').forEach(b => b.classList.toggle('active', b.dataset.label === label));
  const nav = NAV.find(n => n.label === label);
  document.getElementById('pageTitle').textContent = label;
  document.getElementById('pageSubtitle').textContent = nav ? nav.subtitle : '';
}

function renderNavShell() {
  const sidebarNav = document.getElementById('sidebarNav');
  NAV.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (item.label === activeLabel ? ' active' : '');
    btn.dataset.label = item.label;
    btn.onclick = () => setActive(item.label);
    btn.innerHTML = `
      ${item.label === activeLabel ? '<span class="active-bar"></span>' : ''}
      <span class="nav-icon" style="color:${item.label===activeLabel?'var(--accent)':'var(--muted)'}">${I[item.iconKey]}</span>
      <span style="flex:1">${item.label}</span>
      ${item.label === activeLabel ? '<span class="nav-dot"></span>' : ''}
    `;
    sidebarNav.appendChild(btn);
  });

  const mobileTabs = document.getElementById('mobileTabs');
  NAV.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'mobile-tab' + (item.label === activeLabel ? ' active' : '');
    btn.dataset.label = item.label;
    btn.onclick = () => setActive(item.label);
    btn.innerHTML = `<span style="width:13px;height:13px;display:inline-flex">${I[item.iconKey]}</span>${item.label}`;
    mobileTabs.appendChild(btn);
  });
}

function setLastUpdated(date) {
  document.getElementById('lastUpdated').textContent = date.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function showLoadError(err) {
  console.error(err);
  const overlay = document.getElementById('loadingOverlay');
  overlay.innerHTML = `
    <div class="error-banner" style="max-width:420px">
      <span style="width:18px;height:18px;flex-shrink:0">${I.alert}</span>
      <span>Não foi possível carregar os dados do Supabase. ${err.message || ''}</span>
    </div>
    <button class="retry-btn" onclick="location.reload()">Tentar novamente</button>
  `;
}

async function startApp() {
  renderNavShell();
  setActive(activeLabel);
  loadAndRender().catch(showLoadError);
}

// Full, unfiltered datasets fetched once — the period filter slices these
// client-side rather than re-querying Supabase on every change.
let rawData = null;

function buildState(periodKey) {
  const range = getPeriodRange(periodKey);
  const { bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw, bancoStats } = rawData;

  const fluxoCaixaFiltered = fluxoCaixa.filter(r => inPeriod(r.Data, range));
  const recebiveisFiltered = recebiveis.filter(r => inPeriod(r["Data Venda"], range));
  const kpis = computeKpisFiltered(resumoVendasRaw, fluxoCaixa, bancoStats.saldoTotal, range);
  const receberSummary = computeReceberSummary(recebiveisFiltered);
  const pmr = computePMR(recebiveisFiltered);

  return {
    kpis, bancos, bancoStats,
    fluxoCaixa: fluxoCaixaFiltered, fluxoMensal,
    receber: { rows: recebiveisFiltered, summary: receberSummary },
    pmr, vendasObra,
  };
}

function renderAll(state) {
  renderBanner(state);
  renderDashboardCards(state);
  renderFluxoPage(state);
  renderReceberBanner(state);
  renderReceberSummaryCards(state);
  setupReceberTable(state);
  renderPagarEmptyState();
  renderBancosCards(state);
  setupBancosTable(state);
  renderIndicadoresCards(state);

  initChartDefaults();
  renderDashboardCharts(state);
  renderFluxoChart(state);
  renderBancosChart(state);
  renderIndicadoresChart(state);

  setupAI(state, 'messages',  'quickBtns',  'aiInput',  'sendBtn');
  setupAI(state, 'messages2', 'quickBtns2', 'aiInput2', 'sendBtn2');
  setupExports(state);
}

function setupPeriodFilter() {
  document.getElementById('periodFilter').addEventListener('change', e => {
    renderAll(buildState(e.target.value));
  });
}

async function loadAndRender() {
  const [kpis, bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw] = await Promise.all([
    getKpis(), getBancos(), getFluxoCaixa(), getFluxoMensal(), getRecebiveis(), getVendasObra(), getResumoVendasRaw(),
  ]);

  rawData = { kpis, bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw, bancoStats: computeBancoStats(bancos) };

  setupPeriodFilter();
  renderAll(buildState(document.getElementById('periodFilter').value));

  setLastUpdated(new Date());
  document.getElementById('loadingOverlay').classList.add('hidden');
}

requireAuth();
