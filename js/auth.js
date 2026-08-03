// ── Auth gate (Supabase Auth) ──────────────────────────
function showCard(id) {
  ['loginForm', 'forgotForm', 'resetForm'].forEach(cardId => {
    document.getElementById(cardId).classList.toggle('hidden', cardId !== id);
  });
}

function showLoginScreen(errorMsg) {
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  showCard('loginForm');
  const errEl = document.getElementById('loginError');
  if (errorMsg) {
    errEl.textContent = errorMsg;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
}

function showResetScreen() {
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  showCard('resetForm');
}

function hideLoginScreen() {
  document.getElementById('loginScreen').classList.add('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmit');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  const { error } = await db.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'Entrar';
  if (error) {
    showLoginScreen('Email ou senha incorretos.');
    return;
  }
  hideLoginScreen();
  document.getElementById('loadingOverlay').classList.remove('hidden');
  startApp();
}

async function handleForgotSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  const btn = document.getElementById('forgotSubmit');
  const errEl = document.getElementById('forgotError');
  const okEl = document.getElementById('forgotSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  btn.disabled = false;
  btn.textContent = 'Enviar link';
  if (error) {
    errEl.textContent = 'Não foi possível enviar o link. Tente novamente.';
    errEl.classList.remove('hidden');
    return;
  }
  okEl.textContent = 'Link enviado! Confira sua caixa de entrada.';
  okEl.classList.remove('hidden');
}

async function handleResetSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetPasswordConfirm').value;
  const errEl = document.getElementById('resetError');
  const btn = document.getElementById('resetSubmit');
  errEl.classList.add('hidden');
  if (password !== confirm) {
    errEl.textContent = 'As senhas não coincidem.';
    errEl.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  const { error } = await db.auth.updateUser({ password });
  btn.disabled = false;
  btn.textContent = 'Salvar nova senha';
  if (error) {
    errEl.textContent = 'Não foi possível salvar a nova senha. Tente novamente.';
    errEl.classList.remove('hidden');
    return;
  }
  hideLoginScreen();
  document.getElementById('loadingOverlay').classList.remove('hidden');
  startApp();
}

async function handleLogout() {
  await db.auth.signOut();
  location.reload();
}

function setupAuthUI() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('forgotForm').addEventListener('submit', handleForgotSubmit);
  document.getElementById('resetForm').addEventListener('submit', handleResetSubmit);
  document.getElementById('forgotLink').addEventListener('click', () => showCard('forgotForm'));
  document.getElementById('backToLoginLink').addEventListener('click', () => showCard('loginForm'));
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showResetScreen();
  });
}

async function requireAuth() {
  setupAuthUI();
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    startApp();
  } else {
    showLoginScreen();
  }
}
