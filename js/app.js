// ── Nav ───────────────────────────────────────────────
// INCONTEC AI sits last -- kept out of the way of the day-to-day report
// pages, but its icon stays permanently accent-tinted (see .nav-item-ai in
// styles.css) so it still stands out instead of blending into the list.
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
// Kept out of the main nav list -- rendered in its own slot above the sync
// footer instead, the usual "settings tucked in the corner" placement.
const SETTINGS_NAV = { label:"Configurações", iconKey:"settings", subtitle:"Personalize a aparência do dashboard" };
const ALL_NAV = [...NAV, SETTINGS_NAV];

let activeLabel = "Dashboard";

function navItemInner(iconKey, label, isActive) {
  return `
    ${isActive ? '<span class="active-bar"></span>' : ''}
    <span class="nav-icon-badge"><span class="nav-icon">${I[iconKey]}</span></span>
    <span style="flex:1">${label}</span>
    ${isActive ? '<span class="nav-dot"></span>' : ''}
  `;
}

function setActive(label) {
  activeLabel = label;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + label);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    const isActive = b.dataset.label === label;
    b.classList.toggle('active', isActive);
    b.innerHTML = navItemInner(ALL_NAV.find(n=>n.label===b.dataset.label).iconKey, b.dataset.label, isActive);
  });
  document.querySelectorAll('.mobile-tab').forEach(b => b.classList.toggle('active', b.dataset.label === label));
  const nav = ALL_NAV.find(n => n.label === label);
  document.getElementById('pageTitle').textContent = label;
  document.getElementById('pageSubtitle').textContent = nav ? nav.subtitle : '';

  // The period filter doesn't apply to the AI chat (it isn't fed filtered
  // data) -- swap it for a status pill there instead of showing a control
  // that would look active but silently do nothing.
  const isAI = label === "INCONTEC AI";
  document.getElementById('periodPicker').classList.toggle('hidden', isAI);
  document.getElementById('aiStatusPill').classList.toggle('hidden', !isAI);
  document.getElementById('pageTitle').classList.toggle('ai-active', isAI);
}

function renderNavShell() {
  const sidebarNav = document.getElementById('sidebarNav');
  NAV.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (item.label === activeLabel ? ' active' : '') + (item.label === "INCONTEC AI" ? ' nav-item-ai' : '');
    btn.dataset.label = item.label;
    btn.onclick = () => setActive(item.label);
    btn.innerHTML = navItemInner(item.iconKey, item.label, item.label === activeLabel);
    sidebarNav.appendChild(btn);
  });

  const settingsSlot = document.getElementById('sidebarSettings');
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'nav-item' + (SETTINGS_NAV.label === activeLabel ? ' active' : '');
  settingsBtn.dataset.label = SETTINGS_NAV.label;
  settingsBtn.onclick = () => setActive(SETTINGS_NAV.label);
  settingsBtn.innerHTML = navItemInner(SETTINGS_NAV.iconKey, SETTINGS_NAV.label, SETTINGS_NAV.label === activeLabel);
  settingsSlot.appendChild(settingsBtn);

  const mobileTabs = document.getElementById('mobileTabs');
  ALL_NAV.forEach(item => {
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
  const { bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw, bancoStats, contasPagar } = rawData;

  const fluxoCaixaFiltered = fluxoCaixa.filter(r => inPeriod(r.Data, range));
  const recebiveisFiltered = recebiveis.filter(r => inPeriod(r["Data Venda"], range));
  const kpis = computeKpisFiltered(resumoVendasRaw, fluxoCaixa, bancoStats.saldoTotal, range);
  const receberSummary = computeReceberSummary(recebiveisFiltered);
  const pmr = computePMR(recebiveisFiltered);

  // Contas a Pagar is forward-looking (bills not yet due) -- unlike sales/fluxo,
  // filtering it by a backward-looking period ("últimos 3 meses" etc.) would
  // zero it out, so it's excluded from the period filter, same as bancos.
  const pagarSummary = computePagarSummary(contasPagar);

  return {
    kpis, bancos, bancoStats,
    fluxoCaixa: fluxoCaixaFiltered, fluxoMensal,
    receber: { rows: recebiveisFiltered, summary: receberSummary },
    pagar: { rows: contasPagar, summary: pagarSummary },
    pmr, vendasObra,
  };
}

function renderAll(state) {
  renderBanner(state);
  renderDashboardHero(state);
  renderDashboardCards(state);
  renderFluxoPage(state);
  renderReceberBanner(state);
  renderReceberSummaryCards(state);
  setupReceberTable(state);
  renderPagarBanner(state);
  renderPagarSummaryCards(state);
  setupPagarTable(state);
  renderBancosCards(state);
  setupBancosTable(state);
  renderIndicadoresCards(state);

  initChartDefaults();
  renderDashboardCharts(state);
  renderFluxoChart(state);
  renderBancosChart(state);
  renderIndicadoresChart(state);

  setupAI(state, 'messages2', 'quickBtns2', 'aiInput2', 'sendBtn2');
  setupExports(state);
}

// Custom dropdown instead of a native <select> -- the browser's own option
// list renders with OS-default (light) styling that can't be themed to
// match the dark UI, so this builds the open/closed menu state by hand.
let currentPeriod = '';

function setupPeriodPicker() {
  const wrap = document.getElementById('periodPicker');
  const trigger = document.getElementById('periodTrigger');
  const label = document.getElementById('periodTriggerLabel');
  const menu = document.getElementById('periodMenu');

  const close = () => { wrap.classList.remove('open'); menu.classList.add('hidden'); };
  const open = () => { wrap.classList.add('open'); menu.classList.remove('hidden'); };

  trigger.onclick = e => {
    e.stopPropagation();
    wrap.classList.contains('open') ? close() : open();
  };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });

  menu.querySelectorAll('.period-option').forEach(btn => {
    btn.onclick = () => {
      currentPeriod = btn.dataset.value;
      label.textContent = btn.dataset.label;
      menu.querySelectorAll('.period-option').forEach(b => b.classList.toggle('active', b === btn));
      close();
      renderAll(buildState(currentPeriod));
    };
  });
}

async function loadAndRender() {
  const [kpis, bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw, contasPagar] = await Promise.all([
    getKpis(), getBancos(), getFluxoCaixa(), getFluxoMensal(), getRecebiveis(), getVendasObra(), getResumoVendasRaw(), getContasPagar(),
  ]);

  rawData = { kpis, bancos, fluxoCaixa, fluxoMensal, recebiveis, vendasObra, resumoVendasRaw, contasPagar, bancoStats: computeBancoStats(bancos) };

  setupPeriodPicker();
  setupCustomReport();
  setupSettingsPage();
  renderAll(buildState(currentPeriod));

  setLastUpdated(new Date());
  document.getElementById('loadingOverlay').classList.add('hidden');
}

requireAuth();
