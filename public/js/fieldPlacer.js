requireAuth();

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const docId = new URLSearchParams(location.search).get('id');
if (!docId) window.location.href = '/';

let signersList = [];
let selectedSigner = null;
let selectedFieldType = 'signature';
let placedFields = []; // {id, page, x%, y%, w%, h%, signer_id, field_type, element}
let pdfDoc = null;
let pageWrappers = []; // {wrapper, canvas, overlay, width, height}

// Field type selection
document.querySelectorAll('.field-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.field-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFieldType = btn.dataset.type;
  });
});

async function init() {
  if (!docId) return;
  try {
    const [doc, signers, fields] = await Promise.all([
      apiGet(`/api/documents/${docId}`),
      apiGet(`/api/documents/${docId}/signers`),
      apiGet(`/api/documents/${docId}/fields`)
    ]);

    signersList = signers;
    renderSignerChips();
    if (signers.length) selectSigner(signers[0]);

    // Load PDF
    const token = localStorage.getItem('token');
    const pdfUrl = `/uploads/${doc.stored_name}`;
    // Fetch with auth
    const resp = await fetch(`/api/documents/${docId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    pdfDoc = await pdfjsLib.getDocument(url).promise;
    await renderAllPages();

    // Render existing fields
    fields.forEach(f => renderExistingField(f));
  } catch (err) {
    document.getElementById('canvasArea').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function renderSignerChips() {
  const container = document.getElementById('signerChips');
  container.innerHTML = signersList.map((s, i) => `
    <div class="signer-chip" data-id="${s.id}" onclick="selectSigner(signersList[${i}])" style="background:${signerColor(i)}18;color:${signerColor(i)}">
      <div class="chip-dot" style="background:${signerColor(i)}"></div>
      <div class="chip-info">
        <div class="chip-name">${escHtml(s.name)}</div>
        <div class="chip-email">${escHtml(s.email)}</div>
      </div>
    </div>
  `).join('');
}

function selectSigner(signer) {
  selectedSigner = signer;
  document.querySelectorAll('.signer-chip').forEach((el, i) => {
    el.classList.toggle('selected', signersList[i] && signersList[i].id === signer.id);
  });
}

async function renderAllPages() {
  const area = document.getElementById('canvasArea');
  area.innerHTML = '';
  pageWrappers = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const scale = Math.min(900 / page.getViewport({ scale: 1 }).width, 1.5);
    const viewport = page.getViewport({ scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';
    wrapper.dataset.page = p;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'field-overlay';
    wrapper.appendChild(overlay);

    area.appendChild(wrapper);
    pageWrappers.push({ wrapper, canvas, overlay, width: viewport.width, height: viewport.height, page: p });

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Attach drag-to-create events
    attachOverlayEvents(overlay, p, viewport.width, viewport.height);
  }
}

function attachOverlayEvents(overlay, pageNum, pw, ph) {
  let dragging = false;
  let startX, startY, ghost;

  overlay.addEventListener('mousedown', e => {
    if (!selectedSigner) { alert('Please select a signer first'); return; }
    dragging = true;
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    ghost = document.createElement('div');
    ghost.className = 'sig-field';
    ghost.style.cssText = `left:${startX}px;top:${startY}px;width:0;height:0;border-color:${getSelectedSignerColor()};background:${getSelectedSignerColor()}22;pointer-events:none`;
    overlay.appendChild(ghost);
    e.preventDefault();
  });

  overlay.addEventListener('mousemove', e => {
    if (!dragging || !ghost) return;
    const rect = overlay.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const x = Math.min(startX, cx);
    const y = Math.min(startY, cy);
    const w = Math.abs(cx - startX);
    const h = Math.abs(cy - startY);
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
    ghost.style.width = w + 'px';
    ghost.style.height = h + 'px';
  });

  overlay.addEventListener('mouseup', async e => {
    if (!dragging || !ghost) return;
    dragging = false;
    const rect = overlay.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const x = Math.min(startX, cx);
    const y = Math.min(startY, cy);
    const w = Math.abs(cx - startX);
    const h = Math.abs(cy - startY);

    overlay.removeChild(ghost);
    ghost = null;

    if (w < 20 || h < 10) return; // too small

    const xPct = (x / pw) * 100;
    const yPct = (y / ph) * 100;
    const wPct = (w / pw) * 100;
    const hPct = (h / ph) * 100;

    try {
      const field = await apiPost(`/api/documents/${docId}/fields`, {
        signer_id: selectedSigner.id,
        page_number: pageNum,
        x_percent: xPct, y_percent: yPct,
        width_percent: wPct, height_percent: hPct,
        field_type: selectedFieldType
      });
      renderFieldElement(field, overlay, pw, ph);
    } catch (err) { alert(err.message); }
  });
}

function renderExistingField(field) {
  const pw = pageWrappers.find(p => p.page === field.page_number);
  if (!pw) return;
  renderFieldElement(field, pw.overlay, pw.width, pw.height);
}

function renderFieldElement(field, overlay, pw, ph) {
  const signerIdx = signersList.findIndex(s => s.id === field.signer_id);
  const color = signerColor(signerIdx >= 0 ? signerIdx : 0);

  const x = (field.x_percent / 100) * pw;
  const y = (field.y_percent / 100) * ph;
  const w = (field.width_percent / 100) * pw;
  const h = (field.height_percent / 100) * ph;

  const el = document.createElement('div');
  el.className = 'sig-field';
  el.dataset.fieldId = field.id;
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-color:${color};background:${color}22;color:${color}`;

  const signer = signersList.find(s => s.id === field.signer_id);
  const label = field.label || `${t('type_' + field.field_type) || field.field_type} — ${signer ? signer.name : ''}`;
  el.innerHTML = `
    <span class="field-label">${escHtml(label)}</span>
    <button class="delete-field" onclick="deleteField(${field.id}, this.closest('.sig-field'))">✕</button>
    <div class="resize-handle" style="border-color:${color}"></div>`;

  makeDraggable(el, field, overlay, pw, ph);
  makeResizable(el, field, overlay, pw, ph);
  overlay.appendChild(el);
}

function makeDraggable(el, field, overlay, pw, ph) {
  let ox, oy;
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('delete-field') || e.target.classList.contains('resize-handle')) return;
    e.stopPropagation();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    const onMove = ev => {
      const nx = Math.max(0, Math.min(pw - el.offsetWidth, ev.clientX - ox));
      const ny = Math.max(0, Math.min(ph - el.offsetHeight, ev.clientY - oy));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    };
    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const xPct = (el.offsetLeft / pw) * 100;
      const yPct = (el.offsetTop / ph) * 100;
      try {
        await apiPut(`/api/documents/${docId}/fields/${field.id}`, { x_percent: xPct, y_percent: yPct });
        field.x_percent = xPct; field.y_percent = yPct;
      } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeResizable(el, field, overlay, pw, ph) {
  const handle = el.querySelector('.resize-handle');
  handle.addEventListener('mousedown', e => {
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = el.offsetWidth, startH = el.offsetHeight;
    const onMove = ev => {
      const nw = Math.max(40, startW + (ev.clientX - startX));
      const nh = Math.max(20, startH + (ev.clientY - startY));
      el.style.width = nw + 'px';
      el.style.height = nh + 'px';
    };
    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const wPct = (el.offsetWidth / pw) * 100;
      const hPct = (el.offsetHeight / ph) * 100;
      try {
        await apiPut(`/api/documents/${docId}/fields/${field.id}`, { width_percent: wPct, height_percent: hPct });
        field.width_percent = wPct; field.height_percent = hPct;
      } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

async function deleteField(fieldId, el) {
  try {
    await apiDelete(`/api/documents/${docId}/fields/${fieldId}`);
    el.remove();
  } catch (err) { alert(err.message); }
}

async function saveAndSend() {
  // If no signers yet, prompt
  if (!signersList.length) { alert('Add signers first on the upload page'); return; }
  try {
    const data = await apiPatch(`/api/documents/${docId}/send`);
    showLinks(data.signers);
  } catch (err) { alert(err.message); }
}

function showLinks(signers) {
  const base = window.location.origin;
  const html = signers.map(s => `
    <div style="margin-bottom:12px">
      <strong>${escHtml(s.name)}</strong><br>
      <input type="text" value="${base}/sign?token=${s.signing_token}" readonly onclick="this.select()" style="width:100%;font-size:12px;margin-top:4px">
    </div>`).join('');
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div class="card" style="max-width:500px;width:100%;max-height:90vh;overflow-y:auto">
      <h3 style="margin-bottom:16px">${t('send_success').split('!')[0]}!</h3>
      ${html}
      <a href="/" class="btn btn-primary btn-full" style="margin-top:12px">${t('back')}</a>
    </div>`;
  document.body.appendChild(modal);
}

function getSelectedSignerColor() {
  const idx = signersList.findIndex(s => s.id === selectedSigner?.id);
  return signerColor(idx >= 0 ? idx : 0);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
