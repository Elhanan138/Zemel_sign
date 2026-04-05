requireAuth();

let uploadedDocId = null;
let signers = [];

// Drag and drop
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});
document.getElementById('fileInput').addEventListener('change', e => {
  if (e.target.files[0]) setFile(e.target.files[0]);
});

function setFile(file) {
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('filePreview').classList.remove('hidden');
  dropZone.classList.add('hidden');
}

function clearFile() {
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').classList.add('hidden');
  dropZone.classList.remove('hidden');
}

async function doUpload() {
  const title = document.getElementById('docTitle').value.trim();
  const file = document.getElementById('fileInput').files[0];
  const errEl = document.getElementById('uploadError');
  const successEl = document.getElementById('uploadSuccess');
  errEl.classList.add('hidden');

  if (!title) { errEl.textContent = t('doc_title') + ' is required'; errEl.classList.remove('hidden'); return; }
  if (!file) { errEl.textContent = 'Please select a file'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btnUpload');
  btn.disabled = true;
  document.getElementById('uploadProgress').classList.remove('hidden');
  document.getElementById('progressFill').style.width = '30%';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    document.getElementById('progressFill').style.width = '60%';
    const doc = await apiPost('/api/documents', formData);
    document.getElementById('progressFill').style.width = '100%';

    uploadedDocId = doc.id;
    successEl.textContent = t('upload_success');
    successEl.classList.remove('hidden');

    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('btnUpload').classList.add('hidden');
    document.getElementById('btnSend').classList.remove('hidden');
    document.getElementById('btnPlaceFields').classList.remove('hidden');
    document.getElementById('step1').querySelector('input, .drop-zone, .btn').disabled = true;

    setTimeout(() => { document.getElementById('uploadProgress').classList.add('hidden'); }, 600);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    document.getElementById('progressFill').style.width = '0';
    btn.disabled = false;
  }
}

function addSigner() {
  const name = document.getElementById('signerName').value.trim();
  const email = document.getElementById('signerEmail').value.trim();
  const order = parseInt(document.getElementById('signerOrder').value) || 1;
  if (!name || !email) return;

  signers.push({ name, email, signing_order: order });
  renderSigners();
  document.getElementById('signerName').value = '';
  document.getElementById('signerEmail').value = '';
}

function removeSigner(i) {
  signers.splice(i, 1);
  renderSigners();
}

function renderSigners() {
  const list = document.getElementById('signerList');
  if (!signers.length) { list.innerHTML = ''; return; }
  list.innerHTML = signers.map((s, i) => `
    <div class="signer-row">
      <div class="signer-avatar" style="background:${signerColor(i)}">${initials(s.name)}</div>
      <div class="signer-row-info">
        <div class="signer-row-name">${escHtml(s.name)}</div>
        <div class="signer-row-email">${escHtml(s.email)}</div>
      </div>
      <span class="signer-order-badge">#${s.signing_order}</span>
      <button class="btn-icon" onclick="removeSigner(${i})">✕</button>
    </div>
  `).join('');
}

async function sendDocument() {
  if (!uploadedDocId) return;
  const errEl = document.getElementById('uploadError');
  errEl.classList.add('hidden');

  if (!signers.length) {
    errEl.textContent = 'Add at least one signer'; errEl.classList.remove('hidden'); return;
  }

  try {
    // Add all signers
    for (const s of signers) {
      await apiPost(`/api/documents/${uploadedDocId}/signers`, s);
    }
    // Send document
    const data = await apiPatch(`/api/documents/${uploadedDocId}/send`);
    showSigningLinksPage(data.signers);
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
}

function showSigningLinksPage(signerList) {
  const base = window.location.origin;
  const linksHtml = signerList.map((s, i) => `
    <div style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">
        <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${signerColor(i)};color:white;font-size:10px;font-weight:700;text-align:center;line-height:20px;margin-right:8px">${initials(s.name)}</span>
        ${escHtml(s.name)} &lt;${escHtml(s.email)}&gt;
      </div>
      <div class="signing-link-box">
        <input type="text" value="${base}/sign?token=${s.signing_token}" readonly onclick="this.select()" style="flex:1;border:none;background:transparent;font-size:12px;color:var(--primary)">
        <button class="btn btn-outline btn-sm" onclick="copyLink('${base}/sign?token=${s.signing_token}', this)">Copy</button>
      </div>
    </div>
  `).join('');

  document.querySelector('.main-content').innerHTML = `
    <div class="page-header"><h1>${t('send_success').split('!')[0]}!</h1></div>
    <div class="card">
      <p style="margin-bottom:20px;color:var(--text-muted)">${t('send_success')}</p>
      ${linksHtml}
      <a href="/" class="btn btn-primary" style="margin-top:16px">${t('back')}</a>
    </div>`;
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

function goToPlaceFields() {
  if (!uploadedDocId) return;
  // Save signers first then redirect
  Promise.all(signers.map(s => apiPost(`/api/documents/${uploadedDocId}/signers`, s)))
    .then(() => { window.location.href = `/place-fields?id=${uploadedDocId}`; })
    .catch(() => { window.location.href = `/place-fields?id=${uploadedDocId}`; });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
