// ── Aparência personalizável (cor de destaque + logo) ──
// Stored in localStorage, not Supabase -- this is a per-browser display
// preference, not app data, so it doesn't need a table/RLS round-trip.
const THEME_KEY = 'incontec_theme';
const DEFAULT_ACCENT = '#6fe3a6';
const DEFAULT_NAME = 'INCONTEC DASH';

function loadTheme() {
  try { return JSON.parse(localStorage.getItem(THEME_KEY)) || {}; } catch { return {}; }
}

function saveTheme(theme) {
  const clean = {};
  Object.keys(theme).forEach(k => { if (theme[k]) clean[k] = theme[k]; });
  localStorage.setItem(THEME_KEY, JSON.stringify(clean));
  return clean;
}

function hexToRgb(hex) {
  const m = (hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

// Derives --accent-dim from a custom --accent by blending it toward the
// background, the same relationship the default palette already has
// (#6FE3A6 accent -> #345042 dim is roughly a 35% blend toward --bg).
function mixWithBg(hex, ratio = 0.35) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const bg = { r: 0x0a, g: 0x0e, b: 0x0c };
  const mix = ch => Math.round(c[ch] * ratio + bg[ch] * (1 - ratio));
  return `rgb(${mix('r')}, ${mix('g')}, ${mix('b')})`;
}

// Applied at script-load time (before login even) so the custom branding
// is visible everywhere immediately, not just after logging in.
function applyTheme(theme) {
  const root = document.documentElement.style;
  if (theme.accent) {
    root.setProperty('--accent', theme.accent);
    root.setProperty('--accent-dim', mixWithBg(theme.accent));
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--accent-dim');
  }
  document.querySelectorAll('.logo-icon').forEach(el => {
    if (theme.logo) {
      el.style.background = `center/cover url("${theme.logo}")`;
      el.textContent = '';
    } else {
      el.style.background = '';
      el.textContent = 'ID';
    }
  });
  const name = theme.name || DEFAULT_NAME;
  document.title = name;
  document.querySelectorAll('.logo-title').forEach(el => { el.textContent = name; });
  const loginTitle = document.getElementById('loginBrandTitle');
  if (loginTitle) loginTitle.textContent = name;
}

applyTheme(loadTheme());

function setupSettingsPage() {
  const theme = loadTheme();
  const nameInput = document.getElementById('settingsName');
  const accentInput = document.getElementById('settingsAccent');
  const fileInput = document.getElementById('settingsLogoFile');

  nameInput.value = theme.name || '';
  accentInput.value = theme.accent || DEFAULT_ACCENT;

  function update(partial) {
    const next = saveTheme({ ...loadTheme(), ...partial });
    applyTheme(next);
  }

  nameInput.oninput = () => update({ name: nameInput.value.trim() });
  accentInput.oninput = () => update({ accent: accentInput.value });

  document.getElementById('settingsLogoUpload').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { showToast('Imagem muito grande (máx. 500KB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => { update({ logo: reader.result }); showToast('Logo atualizada', 'success'); };
    reader.readAsDataURL(file);
  };
  document.getElementById('settingsLogoReset').onclick = () => update({ logo: null });

  document.getElementById('settingsResetAll').onclick = () => {
    localStorage.removeItem(THEME_KEY);
    applyTheme({});
    nameInput.value = '';
    accentInput.value = DEFAULT_ACCENT;
    showToast('Aparência restaurada ao padrão', 'success');
  };
}
