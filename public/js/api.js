// API helper with auth headers
function getToken() { return localStorage.getItem('token'); }

function isTokenExpired() {
  const token = getToken();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch { return true; }
}

function requireAuth() {
  if (!getToken() || isTokenExpired()) { logout(); return false; }
  return true;
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function apiGet(url) { return apiFetch(url); }
function apiPost(url, body) {
  if (body instanceof FormData) return apiFetch(url, { method: 'POST', body });
  return apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
}
function apiPatch(url, body) { return apiFetch(url, { method: 'PATCH', body: JSON.stringify(body) }); }
function apiDelete(url) { return apiFetch(url, { method: 'DELETE' }); }
function apiPut(url, body) { return apiFetch(url, { method: 'PUT', body: JSON.stringify(body) }); }

function statusBadgeHtml(status) {
  return `<span class="status-badge status-${status}">${t('status_' + status) || status}</span>`;
}

// Colors for signers
const SIGNER_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
function signerColor(i) { return SIGNER_COLORS[i % SIGNER_COLORS.length]; }

function initials(name) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}
