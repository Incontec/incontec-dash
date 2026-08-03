// ── Auth gate (Supabase Auth) ──────────────────────────
function showLoginScreen(errorMsg) {
  document.getElementById('loadingOverlay').classList.add('hidden');
  const el = document.getElementById('loginScreen');
  el.classList.remove('hidden');
  const errEl = document.getElementById('loginError');
  if (errorMsg) {
    errEl.textContent = errorMsg;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
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

async function handleLogout() {
  await db.auth.signOut();
  location.reload();
}

function setupAuthUI() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
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
