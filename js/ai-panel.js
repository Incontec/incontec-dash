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
      const d = document.createElement('div');
      d.className = `message ${m.role}` + (m.pending ? ' pending' : '');
      d.textContent = m.text;
      msgsEl.appendChild(d);
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
