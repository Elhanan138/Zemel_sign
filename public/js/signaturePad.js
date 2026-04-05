pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const token = new URLSearchParams(location.search).get('token');
if (!token) document.body.innerHTML = '<p style="padding:40px;text-align:center">Invalid link</p>';

// Apply saved language
const lang = localStorage.getItem('lang') || 'en';
setLang(lang);

let signerData = null;
let docData = null;
let fieldsData = [];
let signedFields = {}; // field_id -> {image_data, signature_type}
let activeField = null;
let pdfDocObj = null;
let pageWrappers = [];

// Canvas drawing state
let isDrawing = false;
let lastX = 0, lastY = 0;
let uploadedSigData = null;

async function init() {
  try {
    const data = await fetch(`/api/sign/${token}`).then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j;
    });

    if (data.waitingForOthers) {
      document.getElementById('waitingMsg').classList.remove('hidden');
      return;
    }

    signerData = data.signer;
    docData = data.document;
    fieldsData = data.fields;

    document.getElementById('signerName').textContent = signerData.name;
    document.getElementById('docTitleDisplay').textContent = docData.title;

    document.getElementById('mainLayout').classList.remove('hidden');
    renderFieldList();
    await loadPdf();
    renderFieldBoxes();
    initDrawCanvas();
  } catch (err) {
    if (err.message === 'Already signed' || err.message?.includes('already')) {
      document.getElementById('signedMsg').classList.remove('hidden');
    } else {
      document.body.innerHTML = `<div style="padding:40px;text-align:center"><div style="font-size:48px">⚠️</div><h2>${err.message}</h2></div>`;
    }
  }
}

function renderFieldList() {
  const list = document.getElementById('fieldList');
  list.innerHTML = fieldsData.map(f => `
    <div class="field-item" id="fi-${f.id}" onclick="activateField(${f.id})">
      <div class="field-item-type">${t('type_' + f.field_type) || f.field_type}</div>
      <div class="field-item-page">${t('field_page')} ${f.page_number}</div>
    </div>
  `).join('');
}

async function loadPdf() {
  const resp = await fetch(`/api/sign/${token}/pdf`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  pdfDocObj = await pdfjsLib.getDocument(url).promise;

  const area = document.getElementById('signCanvasArea');
  area.innerHTML = '';
  pageWrappers = [];

  for (let p = 1; p <= pdfDocObj.numPages; p++) {
    const page = await pdfDocObj.getPage(p);
    const scale = Math.min(800 / page.getViewport({ scale: 1 }).width, 1.5);
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

    area.appendChild(wrapper);
    pageWrappers.push({ wrapper, width: viewport.width, height: viewport.height, page: p });

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
}

function renderFieldBoxes() {
  // Remove existing boxes
  document.querySelectorAll('.field-box').forEach(b => b.remove());

  fieldsData.forEach(f => {
    const pw = pageWrappers.find(p => p.page === f.page_number);
    if (!pw) return;
    const x = (f.x_percent / 100) * pw.width;
    const y = (f.y_percent / 100) * pw.height;
    const w = (f.width_percent / 100) * pw.width;
    const h = (f.height_percent / 100) * pw.height;

    const box = document.createElement('div');
    box.className = `field-box${signedFields[f.id] ? ' signed' : ''}`;
    box.id = `fb-${f.id}`;
    box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    box.dataset.fieldId = f.id;

    if (signedFields[f.id]) {
      const img = document.createElement('img');
      img.src = signedFields[f.id].image_data;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain';
      box.appendChild(img);
    } else {
      const prompt = document.createElement('span');
      prompt.className = 'field-prompt';
      prompt.textContent = f.field_type === 'date' ? t('click_to_fill') : t('click_to_sign');
      box.appendChild(prompt);
      box.onclick = () => activateField(f.id);
    }

    pw.wrapper.appendChild(box);
  });
}

function activateField(fieldId) {
  activeField = fieldsData.find(f => f.id === fieldId);
  if (!activeField) return;

  // Highlight in list
  document.querySelectorAll('.field-item').forEach(el => el.classList.remove('active'));
  const fi = document.getElementById(`fi-${fieldId}`);
  if (fi) { fi.classList.add('active'); fi.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  if (activeField.field_type === 'date') {
    // Auto-fill date
    const dateStr = new Date().toLocaleDateString();
    applyToField(fieldId, `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="4" y="34" font-size="22" fill="#1e3a8a" font-family="Arial">${dateStr}</text></svg>`)}`, 'typed');
  } else {
    // Show signature pad
    const padSection = document.getElementById('sigPadSection');
    padSection.classList.remove('hidden');
    padSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    clearDraw();
  }

  // Scroll to field in PDF
  const box = document.getElementById(`fb-${fieldId}`);
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function applyToField(fieldId, imageData, sigType) {
  signedFields[fieldId] = { image_data: imageData, signature_type: sigType };
  const fi = document.getElementById(`fi-${fieldId}`);
  if (fi) fi.classList.add('done');
  renderFieldBoxes();
  checkAllSigned();
}

function checkAllSigned() {
  const required = fieldsData.filter(f => f.is_required);
  const allDone = required.every(f => signedFields[f.id]);
  document.getElementById('btnSubmit').disabled = !allDone;
}

// ===== Drawing =====
function initDrawCanvas() {
  const canvas = document.getElementById('drawCanvas');
  canvas.width = canvas.offsetWidth || 260;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [(clientX - rect.left) * (canvas.width / rect.width),
            (clientY - rect.top) * (canvas.height / rect.height)];
  };

  canvas.addEventListener('mousedown', e => { isDrawing = true; [lastX, lastY] = getPos(e); });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing = true; [lastX, lastY] = getPos(e); }, { passive: false });
  canvas.addEventListener('mousemove', e => { if (!isDrawing) return; draw(ctx, getPos(e)); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!isDrawing) return; draw(ctx, getPos(e)); }, { passive: false });
  canvas.addEventListener('mouseup', () => { isDrawing = false; });
  canvas.addEventListener('touchend', () => { isDrawing = false; });
}

function draw(ctx, [x, y]) {
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  [lastX, lastY] = [x, y];
}

function clearDraw() {
  const canvas = document.getElementById('drawCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function switchSigTab(tab) {
  ['draw', 'type', 'upload'].forEach(t => {
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle('hidden', t !== tab);
    document.querySelector(`[data-tab="${t}"]`).classList.toggle('active', t === tab);
  });
}

function updateTypedPreview() {
  document.getElementById('typedPreview').textContent = document.getElementById('typedSig').value;
}

function handleSigUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    uploadedSigData = ev.target.result;
    document.getElementById('uploadSigPreview').innerHTML = `<img src="${ev.target.result}" style="max-height:80px;max-width:100%;border-radius:6px">`;
  };
  reader.readAsDataURL(file);
}

function applySignature(type) {
  if (!activeField) { alert('Please click a field to sign first'); return; }

  let imageData;
  if (type === 'drawn') {
    const canvas = document.getElementById('drawCanvas');
    imageData = canvas.toDataURL('image/png');
    // Check if empty
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasDrawing = data.some((v, i) => i % 4 === 3 && v > 10);
    if (!hasDrawing) { alert(t('clear') + '?'); return; }
  } else if (type === 'typed') {
    const text = document.getElementById('typedSig').value.trim();
    if (!text) return;
    // Render text to canvas
    const c = document.createElement('canvas');
    c.width = 300; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'transparent';
    ctx.font = '42px "Brush Script MT", cursive';
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText(text, 8, 58);
    imageData = c.toDataURL('image/png');
  } else if (type === 'uploaded') {
    imageData = uploadedSigData;
    if (!imageData) { alert('Please upload an image first'); return; }
  }

  applyToField(activeField.id, imageData, type);
  document.getElementById('sigPadSection').classList.add('hidden');
  activeField = null;
}

async function submitSignatures() {
  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.textContent = '...';

  const sigs = Object.entries(signedFields).map(([field_id, s]) => ({
    field_id: parseInt(field_id),
    signature_type: s.signature_type,
    image_data: s.image_data
  }));

  try {
    const res = await fetch(`/api/sign/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatures: sigs })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('mainLayout').classList.add('hidden');
    document.getElementById('signedMsg').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = t('submit_signatures');
  }
}

async function declineDocument() {
  if (!confirm(t('decline_btn') + '?')) return;
  try {
    await fetch(`/api/sign/${token}/decline`, { method: 'POST' });
    document.getElementById('mainLayout').classList.add('hidden');
    document.body.innerHTML = `
      <div style="padding:60px;text-align:center">
        <div style="font-size:48px">🚫</div>
        <h2 style="margin:16px 0">${t('declined')}</h2>
      </div>`;
  } catch {}
}

init();
