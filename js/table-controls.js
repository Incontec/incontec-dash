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
  let query = '', agingKey = 'todos', sortKey = 'Total a Receber', sortDir = 'desc', page = 1;

  function agingBucket(row) {
    if (!row["Data Venda"]) return 'antigo';
    const dias = Math.round((new Date() - new Date(row["Data Venda"])) / 86400000);
    if (dias < 90) return 'recente';
    if (dias <= 365) return 'medio';
    return 'antigo';
  }

  function filtered() {
    return allRows.filter(r => {
      if (agingKey !== 'todos' && agingBucket(r) !== agingKey) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (r.Cliente || '').toLowerCase().includes(q) || (r.Obra || '').toLowerCase().includes(q);
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
    { key: 'recente', label: '< 90 dias' },
    { key: 'medio', label: '90–365 dias' },
    { key: 'antigo', label: '> 365 dias' },
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
function setupPagarTable(state) {
  const allRows = state.pagar.rows;
  const pageEl = document.getElementById('page-Contas a Pagar');
  const pageSize = 15;
  let query = '', statusKey = 'todos', sortKey = 'vencimento', sortDir = 'asc', page = 1;

  function filtered() {
    return allRows.filter(r => {
      if (statusKey !== 'todos') {
        const want = statusKey === 'vencido' ? 'Vencido' : 'A Vencer';
        if (statusFromPagar(r) !== want) return false;
      }
      if (!query) return true;
      const q = query.toLowerCase();
      return (r.nominal || '').toLowerCase().includes(q) || (r.obra || '').toLowerCase().includes(q);
    });
  }

  function render() {
    const rows = sortRows(filtered(), sortKey, sortDir, textAccessor);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    renderPagarTable(paginate(rows, page, pageSize));
    renderPagination(document.getElementById('pagar-pagination'), { page, totalPages, onPageChange: p => { page = p; render(); } });
    updateSortHeaders(pageEl, sortKey, sortDir);
  }

  document.getElementById('pagar-search').oninput = e => { query = e.target.value; page = 1; render(); };

  const chips = [
    { key: 'todos', label: 'Todos' },
    { key: 'vencido', label: 'Vencidos' },
    { key: 'a_vencer', label: 'A Vencer' },
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
