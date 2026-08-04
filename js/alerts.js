// ── Destinatários de alertas por WhatsApp ──────────────
// Unlike the theme settings (localStorage, per-browser display prefs), this
// has to be readable by the n8n workflow that sends the daily summary, so
// it lives in Supabase instead.
const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function getAlertRecipients() {
  const { data, error } = await db.from('alert_recipients').select('*').order('created_at');
  if (error) throw new Error(`Falha ao consultar destinatários: ${error.message}`);
  return data || [];
}

async function addAlertRecipient(recipient) {
  const { error } = await db.from('alert_recipients').insert(recipient);
  if (error) throw new Error(`Falha ao adicionar destinatário: ${error.message}`);
}

async function removeAlertRecipient(id) {
  const { error } = await db.from('alert_recipients').delete().eq('id', id);
  if (error) throw new Error(`Falha ao remover destinatário: ${error.message}`);
}

function renderAlertRecipients(rows) {
  const list = document.getElementById('alertRecipientsList');
  if (!rows.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px 0">Nenhum destinatário cadastrado ainda.</div>`;
    return;
  }
  list.innerHTML = rows.map(r => {
    const tags = [
      r.ver_saldo ? 'Saldo' : null,
      r.ver_contas_receber ? 'Contas a Receber' : null,
      r.ver_contas_pagar ? 'Contas a Pagar' : null,
    ].filter(Boolean).join(' · ') || 'Nenhuma seção selecionada';
    return `
      <div class="alert-recipient-row">
        <div>
          <div class="alert-recipient-name">${r.nome}</div>
          <div class="alert-recipient-meta">${r.telefone} · ${tags}</div>
        </div>
        <button class="btn-secondary alert-recipient-remove" data-id="${r.id}" type="button">Remover</button>
      </div>`;
  }).join('');
  list.querySelectorAll('.alert-recipient-remove').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await removeAlertRecipient(btn.dataset.id);
        await refreshAlertRecipients();
        showToast('Destinatário removido', 'success');
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    };
  });
}

async function refreshAlertRecipients() {
  const rows = await getAlertRecipients();
  renderAlertRecipients(rows);
}

function setupAlertRecipients() {
  refreshAlertRecipients().catch(err => {
    document.getElementById('alertRecipientsList').innerHTML =
      `<div style="font-size:12px;color:#E38C8C;padding:8px 0">${err.message}</div>`;
  });

  document.getElementById('alertRecipientForm').onsubmit = async e => {
    e.preventDefault();
    const nome = document.getElementById('alertRecipientNome').value.trim();
    const telefone = document.getElementById('alertRecipientTelefone').value.trim();
    if (!nome || !telefone) { showToast('Preencha nome e telefone', 'error'); return; }
    const recipient = {
      nome, telefone,
      ver_saldo: document.getElementById('alertVerSaldo').checked,
      ver_contas_receber: document.getElementById('alertVerReceber').checked,
      ver_contas_pagar: document.getElementById('alertVerPagar').checked,
      organizacao_id: ORG_ID,
    };
    const btn = document.getElementById('alertRecipientAdd');
    btn.disabled = true;
    try {
      await addAlertRecipient(recipient);
      document.getElementById('alertRecipientForm').reset();
      document.getElementById('alertVerSaldo').checked = true;
      document.getElementById('alertVerReceber').checked = true;
      document.getElementById('alertVerPagar').checked = true;
      await refreshAlertRecipients();
      showToast('Destinatário adicionado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
}
