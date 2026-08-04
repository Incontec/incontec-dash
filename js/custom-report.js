// ── Relatório Personalizado ────────────────────────────
// Reads straight from the unfiltered `rawData` (set once in app.js), not
// from the topbar-period-filtered `state` — the modal has its own period
// and client filters, independent of whatever's selected up top.
const CR_SOURCES = {
  vendas: {
    label: "Vendas",
    dateField: "Data Venda",
    clienteField: "Cliente",
    getRows: () => rawData.resumoVendasRaw,
    columns: [
      { key: "Cliente", label: "Cliente" },
      { key: "Obra", label: "Obra" },
      { key: "Data Venda", label: "Data da Venda" },
      { key: "Valor Venda", label: "Valor Vendido", currency: true },
      { key: "Valor Recebido", label: "Valor Recebido", currency: true },
      { key: "Total a Receber", label: "Total a Receber", currency: true },
      { key: "StatusVen", label: "Status" },
      { key: "Data Quitação", label: "Data de Quitação" },
    ],
  },
  recebiveis: {
    label: "Recebíveis (Inadimplência)",
    dateField: "Data Venda",
    clienteField: "Cliente",
    getRows: () => rawData.recebiveis,
    columns: [
      { key: "Cliente", label: "Cliente" },
      { key: "Obra", label: "Obra" },
      { key: "Data Venda", label: "Data da Venda" },
      { key: "Valor Venda", label: "Valor Vendido", currency: true },
      { key: "Valor Recebido", label: "Valor Recebido", currency: true },
      { key: "Total a Receber", label: "Total a Receber", currency: true },
      { key: "StatusVen", label: "Status" },
    ],
  },
  bancos: {
    label: "Bancos",
    dateField: null,
    clienteField: null,
    getRows: () => rawData.bancos,
    columns: [
      { key: "Descri_banco", label: "Banco" },
      { key: "saldo", label: "Saldo", currency: true },
    ],
  },
  fluxo: {
    label: "Fluxo de Caixa",
    dateField: "Data",
    clienteField: null,
    getRows: () => rawData.fluxoCaixa,
    columns: [
      { key: "Data", label: "Data" },
      { key: "receber", label: "Recebido", currency: true },
      { key: "pagar", label: "Pago", currency: true },
      { key: "saldo", label: "Saldo do Dia", currency: true },
      { key: "saldo_atual", label: "Saldo Acumulado", currency: true },
    ],
  },
};

function crRenderColunas(fonteKey) {
  const src = CR_SOURCES[fonteKey];
  document.getElementById('cr-colunas').innerHTML = src.columns.map(c => `
    <label class="cr-checkbox"><input type="checkbox" value="${c.key}" checked><span>${c.label}</span></label>
  `).join('');
}

function crUpdateVisibility(fonteKey) {
  const src = CR_SOURCES[fonteKey];
  document.getElementById('cr-cliente-group').style.display = src.clienteField ? '' : 'none';
  document.getElementById('cr-periodo-group').style.display = src.dateField ? '' : 'none';
}

function gerarRelatorioPersonalizado() {
  const fonteKey = document.getElementById('cr-fonte').value;
  const src = CR_SOURCES[fonteKey];
  let rows = src.getRows() || [];

  const clienteFiltro = src.clienteField ? document.getElementById('cr-cliente').value.trim().toUpperCase() : '';
  if (clienteFiltro) rows = rows.filter(r => (r[src.clienteField] || '').toUpperCase().includes(clienteFiltro));

  const de = src.dateField ? document.getElementById('cr-de').value : '';
  const ate = src.dateField ? document.getElementById('cr-ate').value : '';
  if (de) rows = rows.filter(r => r[src.dateField] && r[src.dateField] >= de);
  if (ate) rows = rows.filter(r => r[src.dateField] && r[src.dateField] <= ate);

  const checked = [...document.querySelectorAll('#cr-colunas input[type=checkbox]:checked')].map(c => c.value);
  const cols = src.columns.filter(c => checked.includes(c.key));
  if (!cols.length) { showToast('Selecione ao menos uma coluna', 'error'); return; }
  if (!rows.length) { showToast('Nenhum registro encontrado para esses filtros', 'error'); return; }

  const fmt = document.querySelector('.cr-format-btn.active').dataset.fmt;
  const clienteSlug = clienteFiltro ? '-' + clienteFiltro.toLowerCase().replace(/\s+/g, '-') : '';
  const nomeBase = `relatorio-${fonteKey}${clienteSlug}-${todayStamp()}`;
  const nomeLog = `Relatório ${src.label}` + (clienteFiltro ? ` — ${clienteFiltro}` : '');

  try {
    if (fmt === 'pdf') {
      const doc = new jspdf.jsPDF();
      doc.setFontSize(14);
      doc.text(nomeLog, 14, 16);
      doc.setFontSize(9);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);
      doc.autoTable({
        startY: 28,
        head: [cols.map(c => c.label)],
        body: rows.map(r => cols.map(c => c.currency ? fmtBRL(r[c.key] || 0) : (r[c.key] ?? '—'))),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [111, 227, 166], textColor: [6, 20, 12] },
      });
      doc.save(`${nomeBase}.pdf`);
      logReport(nomeLog, 'PDF');
    } else {
      const data = rows.map(r => {
        const obj = {};
        cols.forEach(c => { obj[c.label] = r[c.key] ?? ''; });
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, src.label.slice(0, 31));
      XLSX.writeFile(wb, `${nomeBase}.${fmt === 'xlsx' ? 'xlsx' : 'csv'}`);
      logReport(nomeLog, fmt === 'xlsx' ? 'Excel' : 'CSV');
    }
    showToast(`${nomeLog} exportado`, 'success');
    document.getElementById('customReportModal').classList.add('hidden');
  } catch (err) {
    console.error(err);
    showToast('Falha ao gerar o relatório', 'error');
  }
}

function setupCustomReport() {
  const modal = document.getElementById('customReportModal');
  const fonteSel = document.getElementById('cr-fonte');

  const open = () => {
    crRenderColunas(fonteSel.value);
    crUpdateVisibility(fonteSel.value);
    modal.classList.remove('hidden');
  };
  const close = () => modal.classList.add('hidden');

  document.getElementById('rep-custom').onclick = open;
  document.getElementById('customReportClose').onclick = close;
  document.getElementById('customReportCancel').onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  fonteSel.onchange = () => { crRenderColunas(fonteSel.value); crUpdateVisibility(fonteSel.value); };

  document.querySelectorAll('.cr-format-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.cr-format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  document.getElementById('customReportGenerate').onclick = gerarRelatorioPersonalizado;
}
