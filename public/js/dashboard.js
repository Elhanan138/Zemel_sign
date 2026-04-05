requireAuth();

const user = JSON.parse(localStorage.getItem('user') || '{}');
const navUser = document.getElementById('navUser');
if (navUser && user.name) navUser.textContent = user.name;

let currentStatus = '';

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    loadDocuments();
  });
});

async function loadDocuments() {
  const list = document.getElementById('docList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const url = currentStatus ? `/api/documents?status=${currentStatus}` : '/api/documents';
    const docs = await apiGet(url);
    renderDocuments(docs);
  } catch (err) {
    list.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function renderDocuments(docs) {
  const list = document.getElementById('docList');
  if (!docs.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>${t('no_docs')}</h3>
        <p>${t('no_docs_hint')}</p>
        <a href="/upload" class="btn btn-primary" style="margin-top:16px">+ ${t('new_document')}</a>
      </div>`;
    return;
  }

  list.innerHTML = docs.map(doc => `
    <div class="doc-card" data-id="${doc.id}">
      <div class="doc-card-header">
        <div class="doc-icon">${doc.file_type === 'pdf' ? '📄' : '📝'}</div>
        <div class="doc-info">
          <div class="doc-title" title="${escHtml(doc.title)}">${escHtml(doc.title)}</div>
          <div class="doc-meta">
            ${doc.page_count ? t('page_count', doc.page_count) + ' · ' : ''}
            ${new Date(doc.created_at).toLocaleDateString()}
          </div>
        </div>
        ${statusBadgeHtml(doc.status)}
      </div>
      <div class="doc-card-footer">
        <span class="doc-signers" id="signers-${doc.id}">…</span>
        <div class="doc-actions">${renderDocActions(doc)}</div>
      </div>
    </div>
  `).join('');

  // Load signer counts
  docs.forEach(doc => loadSignerInfo(doc));
}

function renderDocActions(doc) {
  const actions = [];
  if (doc.status === 'draft') {
    actions.push(`<a href="/place-fields?id=${doc.id}" class="btn btn-outline btn-sm">${t('btn_place_fields')}</a>`);
    actions.push(`<button class="btn btn-primary btn-sm" onclick="sendDoc(${doc.id})">${t('btn_send')}</button>`);
  }
  if (['signed', 'completed'].includes(doc.status)) {
    actions.push(`<button class="btn btn-success btn-sm" onclick="downloadSigned(${doc.id})">${t('btn_download')}</button>`);
  }
  actions.push(`<a href="/audit?id=${doc.id}" class="btn btn-ghost btn-sm">${t('btn_audit')}</a>`);
  if (!['voided', 'completed'].includes(doc.status)) {
    actions.push(`<button class="btn btn-ghost btn-sm" style="color:#e53e3e" onclick="voidDoc(${doc.id})">${t('btn_void')}</button>`);
  }
  if (doc.status === 'draft') {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="deleteDoc(${doc.id})">${t('btn_delete')}</button>`);
  }
  return actions.join('');
}

async function loadSignerInfo(doc) {
  try {
    const signers = await apiGet(`/api/documents/${doc.id}/signers`);
    const el = document.getElementById(`signers-${doc.id}`);
    if (!el) return;
    if (!signers.length) { el.textContent = t('signer_count', 0); return; }
    const signed = signers.filter(s => s.status === 'signed').length;
    el.innerHTML = signers.map((s, i) => `
      <span title="${escHtml(s.email)}" style="display:inline-flex;align-items:center;gap:3px;margin-right:4px;font-size:12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${s.status === 'signed' ? '#10b981' : '#94a3b8'};display:inline-block"></span>
        ${escHtml(s.name)}
      </span>
    `).join('');
  } catch {}
}

async function sendDoc(id) {
  try {
    const data = await apiPatch(`/api/documents/${id}/send`);
    showSigningLinks(id, data.signers);
    loadDocuments();
  } catch (err) {
    alert(err.message);
  }
}

function showSigningLinks(docId, signers) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  const base = window.location.origin;
  const linksHtml = signers.map(s => `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">${t('signing_link_label')} ${escHtml(s.name)}</div>
      <div class="signing-link-box">
        <input type="text" value="${base}/sign?token=${s.signing_token}" readonly style="flex:1;border:none;background:transparent;font-size:12px;color:var(--primary)" onclick="this.select()">
        <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${base}/sign?token=${s.signing_token}')">Copy</button>
      </div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="card" style="max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <h3 style="margin-bottom:8px">${t('send_success')}</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">${t('send_success')}</p>
      ${linksHtml}
      <button class="btn btn-primary btn-full" onclick="this.closest('[style*=fixed]').remove()">${t('back')}</button>
    </div>`;
  document.body.appendChild(modal);
}

async function downloadSigned(id) {
  window.location.href = `/api/documents/${id}/finalized`;
}

async function voidDoc(id) {
  if (!confirm(t('confirm_void'))) return;
  try {
    await apiPatch(`/api/documents/${id}/void`);
    loadDocuments();
  } catch (err) { alert(err.message); }
}

async function deleteDoc(id) {
  if (!confirm(t('confirm_delete'))) return;
  try {
    await apiDelete(`/api/documents/${id}`);
    loadDocuments();
  } catch (err) { alert(err.message); }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadDocuments();
