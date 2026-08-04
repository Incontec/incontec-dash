// ── AI panel (shared logic, two instances) ────────────
const PERGUNTAS = [
  "Qual o saldo total disponível?",
  "Qual banco possui maior saldo?",
  "Como está a situação financeira?",
  "Existem riscos financeiros?",
  "Faça um resumo executivo.",
  "Existe concentração excessiva de recursos?",
];

// Rule-based fallback, used only while N8N_WEBHOOK_URL isn't configured yet
// (see n8n/README.md). Once it's set, real questions go to the model instead.
function gerarResposta(pergunta, state) {
  const { kpis, bancoStats } = state;
  const p = pergunta.toLowerCase();
  const lider = bancoStats.bancoLider ? bancoStats.bancoLider.Descri_banco : "—";
  if (p.includes("total") || p.includes("disponível")) return `O saldo consolidado atual é de ${fmtBRL(kpis.saldo_bancos)}, distribuído entre ${bancoStats.qtdBancos} instituições bancárias.`;
  if (p.includes("maior saldo") || p.includes("banco possui")) return `O banco com maior saldo é ${lider}, com ${fmtBRL(bancoStats.bancoLider ? bancoStats.bancoLider.saldo : 0)} (${bancoStats.concentracao}% do total consolidado).`;
  if (p.includes("situação financeira")) return `O saldo consolidado é de ${fmtBRL(kpis.saldo_bancos)}, com ${fmtBRL(kpis.total_receber)} ainda a receber de ${kpis.total_vendas} vendas registradas.`;
  if (p.includes("risco")) return bancoStats.concentracao > 40 ? `Identificado risco de concentração bancária: ${lider} representa ${bancoStats.concentracao}% dos recursos. Recomenda-se diversificação entre instituições.` : `Não foram identificados riscos críticos de concentração. A distribuição entre bancos está dentro de parâmetros saudáveis.`;
  if (p.includes("resumo executivo")) return `Resumo executivo: saldo consolidado de ${fmtBRL(kpis.saldo_bancos)}, liderado por ${lider} (${bancoStats.concentracao}%). Total a receber de ${fmtBRL(kpis.total_receber)}.`;
  if (p.includes("concentração")) return bancoStats.concentracao > 40 ? `Sim, há concentração excessiva: ${lider} detém ${bancoStats.concentracao}% do saldo total. Sugere-se redistribuir recursos para reduzir exposição a uma única instituição.` : `Não há concentração excessiva. Os recursos estão razoavelmente distribuídos entre as instituições financeiras.`;
  return `Não foi possível localizar essa informação nos dados disponíveis no momento.`;
}

// Claude's answers come back as Markdown (headers, bold, lists) — render
// them properly instead of dumping raw "**"/"#" characters into the chat.
// User messages never go through this (kept as plain textContent) since
// they're just echoed input, not content we need to format.
function mdToHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const isTableRow = line => /^\|.*\|$/.test(line);
  const isSeparatorRow = line => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line);
  const splitCells = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  const lines = text.split('\n');
  let html = '';
  let listType = null; // 'ul' | 'ol' | null
  let tableRows = null; // [header, ...body], each a cell-string array

  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  const closeTable = () => {
    if (!tableRows) return;
    const [head, ...body] = tableRows;
    html += '<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
    if (body.length) html += '<tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
    html += '</table>';
    tableRows = null;
  };

  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) { closeList(); closeTable(); return; }

    // GFM table: a header row, a |---|---| separator (skipped), then body rows.
    if (isTableRow(line)) {
      closeList();
      if (!tableRows) { tableRows = [splitCells(line)]; return; }
      if (tableRows.length === 1 && isSeparatorRow(line)) return;
      tableRows.push(splitCells(line));
      return;
    }
    closeTable();

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); html += `<h4>${inline(h[2])}</h4>`; return; }

    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) {
      if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inline(ul[1])}</li>`;
      return;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)/);
    if (ol) {
      if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inline(ol[1])}</li>`;
      return;
    }

    closeList();
    html += `<p>${inline(line)}</p>`;
  });
  closeList();
  closeTable();
  return html;
}

async function askAI(pergunta) {
  const controller = new AbortController();
  // The n8n workflow now pulls kpis/bancos/fluxo/inadimplência in parallel
  // before calling Claude, which can take ~10-15s — 15s was cutting it too
  // close and aborting requests that were actually about to succeed.
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Webhook respondeu ${res.status}`);
    const data = await res.json();
    if (!data.resposta) throw new Error('Resposta sem campo "resposta"');
    return data.resposta;
  } finally {
    clearTimeout(timeout);
  }
}

function setupAI(state, messagesId, quickId, inputId, sendId) {
  const msgsEl = document.getElementById(messagesId);
  const inputEl = document.getElementById(inputId);
  const { kpis, bancoStats } = state;
  const lider = bancoStats.bancoLider ? bancoStats.bancoLider.Descri_banco : "—";
  let msgs = [{ role:'ai', text:`Resumo executivo: saldo consolidado de ${fmtBRL(kpis.saldo_bancos)}. ${lider} concentra ${bancoStats.concentracao}% dos recursos.` }];

  function render() {
    msgsEl.innerHTML = '';
    msgs.forEach(m => {
      const row = document.createElement('div');
      row.className = `msg-row ${m.role}`;
      if (m.role === 'ai') {
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.innerHTML = I.sparkles;
        row.appendChild(avatar);
      }
      const d = document.createElement('div');
      d.className = `message ${m.role}` + (m.pending ? ' pending' : '');
      if (m.role === 'ai' && !m.pending) d.innerHTML = mdToHtml(m.text);
      else d.textContent = m.text;
      row.appendChild(d);
      msgsEl.appendChild(row);
    });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function send(text) {
    if (!text.trim()) return;
    msgs.push({ role:'user', text });
    inputEl.value = '';

    if (!N8N_WEBHOOK_URL) {
      msgs.push({ role:'ai', text: gerarResposta(text, state) });
      render();
      return;
    }

    const pendingMsg = { role:'ai', text:'Consultando…', pending:true };
    msgs.push(pendingMsg);
    render();
    try {
      const answer = await askAI(text);
      pendingMsg.text = answer;
      pendingMsg.pending = false;
    } catch (err) {
      console.error(err);
      pendingMsg.text = 'Não consegui falar com a IA agora. Verifique se o workflow do n8n está ativo e tente novamente.';
      pendingMsg.pending = false;
      showToast('Não foi possível falar com a IA', 'error');
    }
    render();
  }

  const qEl = document.getElementById(quickId);
  qEl.innerHTML = '';
  PERGUNTAS.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = q;
    btn.onclick = () => send(q);
    qEl.appendChild(btn);
  });

  document.getElementById(sendId).onclick = () => send(inputEl.value);
  inputEl.addEventListener('keydown', e => { if (e.key==='Enter') send(inputEl.value); });
  render();
}
