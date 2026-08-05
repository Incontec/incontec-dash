const REPORT_LOG_KEY = "incontec_report_log";

function readReportLog() {
  try { return JSON.parse(localStorage.getItem(REPORT_LOG_KEY)) || []; }
  catch { return []; }
}

function logReport(nome, formato) {
  const log = readReportLog();
  log.unshift({ nome, formato, geradoEm: new Date().toISOString() });
  localStorage.setItem(REPORT_LOG_KEY, JSON.stringify(log.slice(0, 50)));
  renderReportLog();
}

function renderReportLog() {
  const tbody = document.getElementById('relatorios-log');
  const log = readReportLog();
  tbody.innerHTML = log.length
    ? log.map(r => `<tr><td>${r.nome}</td><td style="color:var(--muted)">${r.formato}</td><td style="color:var(--muted)">${new Date(r.geradoEm).toLocaleString('pt-BR')}</td></tr>`).join('')
    : `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:28px 16px">Nenhuma exportação ainda. Gere um relatório acima para começar.</td></tr>`;
}

function exportExtratoCSV(bancos) {
  try {
    const data = bancos.map(b => ({ Banco: b.Descri_banco, Saldo: b.saldo }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    XLSX.writeFile(wb, `extrato-consolidado-${todayStamp()}.csv`);
    logReport("Extrato Consolidado", "CSV");
    showToast("Extrato Consolidado exportado (CSV)", "success");
  } catch (err) {
    console.error(err);
    showToast("Falha ao exportar o Extrato Consolidado", "error");
  }
}

function exportPosicaoXLSX(bancos) {
  try {
    const data = bancos.map(b => ({ Banco: b.Descri_banco, Saldo: b.saldo }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posição de Caixa");
    XLSX.writeFile(wb, `posicao-de-caixa-${todayStamp()}.xlsx`);
    logReport("Posição de Caixa", "Excel");
    showToast("Posição de Caixa exportada (Excel)", "success");
  } catch (err) {
    console.error(err);
    showToast("Falha ao exportar a Posição de Caixa", "error");
  }
}

function exportDrePDF(vendasObra) {
  try {
    const doc = new jspdf.jsPDF();
    doc.setFontSize(14);
    doc.text("DRE Gerencial — Vendas x Recebimentos por Obra", 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    doc.autoTable({
      startY: 28,
      head: [["Obra", "Vendas", "Valor Vendido", "Valor Recebido"]],
      body: vendasObra.map(v => [v.Obra, v.vendas, fmtBRL(v.valor_vendido), fmtBRL(v.valor_recebido)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [111, 227, 166], textColor: [6, 20, 12] },
    });
    doc.save(`dre-gerencial-${todayStamp()}.pdf`);
    logReport("DRE Gerencial", "PDF");
    showToast("DRE Gerencial exportado (PDF)", "success");
  } catch (err) {
    console.error(err);
    showToast("Falha ao exportar o DRE Gerencial", "error");
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function setupExports(state) {
  document.getElementById('rep-extrato').onclick = () => exportExtratoCSV(state.bancos);
  document.getElementById('rep-dre').onclick = () => exportDrePDF(state.vendasObra);
  document.getElementById('rep-posicao').onclick = () => exportPosicaoXLSX(state.bancos);
  renderReportLog();
}
