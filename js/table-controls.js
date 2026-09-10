function sortRows(rows, key, dir, accessor) {
  return [...rows].sort((a, b) => {
    const va = accessor(a, key), vb = accessor(b, key);
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function paginate(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function renderPagination(containerEl, { page, totalPages, onPageChange }) {
  containerEl.innerHTML = '';
  if (totalPages <= 1) return;
  const mkBtn = (label, target, disabled, active) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '');
    b.textContent = label;
    b.disabled = !!disabled;
    b.onclick = () => onPageChange(target);
    return b;
  };
  containerEl.appendChild(mkBtn('‹', Math.max(1, page - 1), page === 1));
  const maxButtons = 7;
  let startP = Math.max(1, page - 3);
  let endP = Math.min(totalPages, startP + maxButtons - 1);
  startP = Math.max(1, endP - maxButtons + 1);
  for (let p = startP; p <= endP; p++) containerEl.appendChild(mkBtn(String(p), p, false, p === page));
  containerEl.appendChild(mkBtn('›', Math.min(totalPages, page + 1), page === totalPages));
}

function updateSortHeaders(scopeEl, sortKey, sortDir) {
  scopeEl.querySelectorAll('[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortKey) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function textAccessor(row, key) {
  const v = row[key];
  return typeof v === 'string' ? v.toLowerCase() : (v || 0);
}

// ── Contas a Receber: search + aging filter + sort + pagination ──────
function setupReceberTable(state) {
  const allRows = state.receber.rows;
  const pageEl = document.getElementById('page-Contas a Receber');
  const pageSize = 15;
  let query = '', agingKey = 'todos', sortKey = 'valor_parcela', sortDir = 'desc', page = 1;

  // Buckets by how overdue the parcela is (days past its effective due date),
  // for collections prioritisation -- not by age of the sale, which this
  // per-installment source no longer carries.
  function agingBucket(row) {
    const venc = row.data_prorrogacao || row.data_vencimento;
    if (!venc) return 'avencer';
    const dias = Math.round((new Date() - new Date(venc)) / 86400000);
    if (dias < 0) return 'avencer';
    if (dias < 90) return 'venc90';
    return 'venc90plus';
  }

  function filtered() {
    return allRows.filter(r => {
      if (agingKey !== 'todos' && agingBucket(r) !== agingKey) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (r.cliente || '').toLowerCase().includes(q) || (r.obra || '').toLowerCase().includes(q);
    });
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderReceberTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('receber-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(pageEl, sortKey, sortDir);
  }

  document.getElementById('receber-search').oninput = e => { query = e.target.value; page = 1; render(); };

  const chips = [
    { key: 'todos', label: 'Todos' },
    { key: 'avencer', label: 'A vencer' },
    { key: 'venc90', label: 'Vencido < 90d' },
    { key: 'venc90plus', label: 'Vencido ≥ 90d' },
  ];
  const chipsEl = document.getElementById('receber-chips');
  chipsEl.innerHTML = '';
  chips.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (c.key === agingKey ? ' active' : '');
    btn.textContent = c.label;
    btn.onclick = () => {
      agingKey = c.key; page = 1;
      [...chipsEl.children].forEach((b, i) => b.classList.toggle('active', chips[i].key === agingKey));
      render();
    };
    chipsEl.appendChild(btn);
  });

  pageEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Contas a Pagar: search + status filter + sort + pagination ───────
// The "Pagas" chip swaps the whole table over to contas_pagas (payment
// history) -- a different dataset, so the header labels for columns 3 and 5
// change (Pago em / Forma) and column sorting is off there (the list comes
// pre-sorted most-recent-first).
function setupPagarTable(state) {
  const allRows = state.pagar.rows;
  const pagasRows = state.pagar.pagas || [];
  const pageEl = document.getElementById('page-Contas a Pagar');
  const headCells = pageEl.querySelectorAll('thead th');
  const pageSize = 15;
  let query = '', statusKey = 'todos', sortKey = 'vencimento', sortDir = 'asc', page = 1;

  function filteredAbertas() {
    return allRows.filter(r => {
      if (statusKey === 'vencido' || statusKey === 'a_vencer') {
        const want = statusKey === 'vencido' ? 'Vencido' : 'A Vencer';
        if (statusFromPagar(r) !== want) return false;
      }
      if (!query) return true;
      const q = query.toLowerCase();
      return (r.nominal || '').toLowerCase().includes(q) || (r.obra || '').toLowerCase().includes(q);
    });
  }
  function filteredPagas() {
    if (!query) return pagasRows;
    const q = query.toLowerCase();
    return pagasRows.filter(r => (r.fornecedor || '').toLowerCase().includes(q) || (r.obra || '').toLowerCase().includes(q));
  }

  const indGrid = pageEl.querySelector('.ind-grid');

  function render() {
    const pagas = statusKey === 'pagas';
    headCells[2].textContent = pagas ? 'Pago em' : 'Vencimento';
    headCells[4].textContent = pagas ? 'Forma' : 'Status';
    // The summary cards below the table are all about open/overdue payables,
    // so they don't apply while the paid-history view is showing.
    if (indGrid) indGrid.style.display = pagas ? 'none' : '';

    const rows = pagas ? filteredPagas() : sortRows(filteredAbertas(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    (pagas ? renderContasPagasTable : renderPagarTable)(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('pagar-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(pageEl, pagas ? null : sortKey, sortDir);
  }

  document.getElementById('pagar-search').oninput = e => { query = e.target.value; page = 1; render(); };

  const chips = [
    { key: 'todos', label: 'Todos' },
    { key: 'vencido', label: 'Vencidos' },
    { key: 'a_vencer', label: 'A Vencer' },
    { key: 'pagas', label: 'Pagas' },
  ];
  const chipsEl = document.getElementById('pagar-chips');
  chipsEl.innerHTML = '';
  chips.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (c.key === statusKey ? ' active' : '');
    btn.textContent = c.label;
    btn.onclick = () => {
      statusKey = c.key; page = 1;
      [...chipsEl.children].forEach((b, i) => b.classList.toggle('active', chips[i].key === statusKey));
      render();
    };
    chipsEl.appendChild(btn);
  });

  pageEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Bancos: search + sort + pagination ────────────────────────────────
function setupBancosTable(state) {
  const pageEl = document.getElementById('page-Bancos');
  const pageSize = 15;
  let query = '', sortKey = 'saldo', sortDir = 'desc', page = 1;

  function filtered() {
    if (!query) return state.bancos;
    const q = query.toLowerCase();
    return state.bancos.filter(b => (b.Descri_banco || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderBancosTable(paginate(rows, page, pageSize), state.bancoStats);
    renderPagination(document.getElementById('bancos-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(pageEl, sortKey, sortDir);
  }

  document.getElementById('bancos-search').oninput = e => { query = e.target.value; page = 1; render(); };

  pageEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Fluxo por Obra: search + sort + pagination ────────────────────────
function setupFluxoObraTable(state) {
  const pageEl = document.getElementById('page-Fluxo de Caixa');
  const tableEl = pageEl.querySelector('#fluxoobra-tbody').closest('.banco-table');
  const pageSize = 15;
  let query = '', sortKey = 'saldo', sortDir = 'desc', page = 1;

  function filtered() {
    if (!query) return state.fluxoObra;
    const q = query.toLowerCase();
    return state.fluxoObra.filter(r => (r.obra || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderFluxoObraTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('fluxoobra-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(tableEl, sortKey, sortDir);
  }

  document.getElementById('fluxoobra-search').oninput = e => { query = e.target.value; page = 1; render(); };

  tableEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Bancos: per-account detail, search + sort + pagination ─────────────
function setupBancosDetalhadoTable(state) {
  const tableEl = document.getElementById('bancosdetalhe-tbody').closest('.banco-table');
  const pageSize = 15;
  let query = '', sortKey = 'banco', sortDir = 'asc', page = 1;

  function filtered() {
    if (!query) return state.bancosDetalhado;
    const q = query.toLowerCase();
    return state.bancosDetalhado.filter(r => (r.banco || '').toLowerCase().includes(q) || (r.conta || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderBancosDetalhadoTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('bancosdetalhe-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(tableEl, sortKey, sortDir);
  }

  document.getElementById('bancosdetalhe-search').oninput = e => { query = e.target.value; page = 1; render(); };

  tableEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Fluxo por Pessoa: search + sort + pagination ────────────────────────
function setupFluxoPessoaTable(state) {
  const tableEl = document.getElementById('fluxopessoa-tbody').closest('.banco-table');
  const pageSize = 15;
  let query = '', sortKey = 'saldo', sortDir = 'desc', page = 1;

  function filtered() {
    if (!query) return state.fluxoPessoa;
    const q = query.toLowerCase();
    return state.fluxoPessoa.filter(r => (r.pessoa || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderFluxoPessoaTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('fluxopessoa-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(tableEl, sortKey, sortDir);
  }

  document.getElementById('fluxopessoa-search').oninput = e => { query = e.target.value; page = 1; render(); };

  tableEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}

// ── Vendas por Empresa: search + sort + pagination ─────────────────────
function setupVendasEmpresaTable(state) {
  const tableEl = document.getElementById('vendasempresa-tbody').closest('.banco-table');
  const pageSize = 15;
  let query = '', sortKey = 'valor_vendido', sortDir = 'desc', page = 1;

  function filtered() {
    if (!query) return state.vendasEmpresa;
    const q = query.toLowerCase();
    return state.vendasEmpresa.filter(r => (r.Empresa || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderVendasEmpresaTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('vendasempresa-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(tableEl, sortKey, sortDir);
  }

  document.getElementById('vendasempresa-search').oninput = e => { query = e.target.value; page = 1; render(); };

  tableEl.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      page = 1; render();
    };
  });

  render();
}
