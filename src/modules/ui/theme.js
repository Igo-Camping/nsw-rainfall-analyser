const THEME_STORAGE_KEY = 'sgTheme';

export function applyTheme(theme, { documentRef = document } = {}) {
  documentRef.documentElement.dataset.theme = theme;
  const btn = documentRef.getElementById('theme-toggle');
  if (!btn) return;
  if (theme === 'dark') {
    btn.textContent = 'Light';
    btn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    btn.textContent = 'Dark';
    btn.setAttribute('aria-label', 'Switch to dark mode');
  }
}

export function toggleTheme({
  documentRef = document,
  storage = localStorage
} = {}) {
  const next = documentRef.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next, { documentRef });
  try { storage.setItem(THEME_STORAGE_KEY, next); } catch(e) {}
}

export function syncThemeFromDocument({ documentRef = document } = {}) {
  applyTheme(documentRef.documentElement.dataset.theme || 'light', { documentRef });
}
