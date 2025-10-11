const BACKEND = 'http://localhost:8000';
const $ = (sel) => document.querySelector(sel);

const state = {
  sessionId: crypto.randomUUID(),
  logsText: '',
  file: null,
  previewUrl: '',
  dark: false,
};

function setTheme(dark) {
  state.dark = dark;
  document.documentElement.classList.toggle('dark', dark);
  $('#themeToggle').textContent = dark ? '☀' : '☾';
}

function addMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : 'A';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerText = content;
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  $('#messages').appendChild(wrap);
  wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function addArtifact(artifact) {
  if (artifact.type !== 'image') return;
  const wrap = document.createElement('div');
  wrap.className = 'artifact';
  const img = document.createElement('img');
  img.src = BACKEND.replace(/\/$/, '') + artifact.url;
  wrap.appendChild(img);
  const cap = document.createElement('div');
  cap.className = 'caption';
  cap.textContent = artifact.caption || '';
  wrap.appendChild(cap);
  $('#messages').appendChild(wrap);
}

function clearTimeline() { $('#timeline').innerHTML = ''; }
function addTimelineItem(text, active=false) {
  const item = document.createElement('div');
  item.className = 'item' + (active ? ' active' : '');
  item.textContent = text;
  $('#timeline').appendChild(item);
}

function startTimeline() {
  clearTimeline();
  addTimelineItem('Understanding the question…', true);
  addTimelineItem('Processing…');
  addTimelineItem('Finishing…');
}
function finalizeTimeline(steps=[]) {
  clearTimeline();
  steps.forEach((s, idx) => {
    const t = s.tool_call ? `${idx+1}. Tool: ${s.tool_call.name}` : `${idx+1}. LLM`;
    addTimelineItem(t, idx === steps.length - 1);
  });
  addTimelineItem('Complete', true);
}

function showPreview(file) {
  if (!file) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file;
  state.previewUrl = URL.createObjectURL(file);
  $('#previewImg').src = state.previewUrl;
  $('#preview').hidden = false;
}

function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
  state.file = null;
  $('#fileInput').value = '';
  $('#preview').hidden = true;
}

async function send() {
  const text = $('#text').value.trim();
  if (!text && !state.file) return;

  startTimeline();
  addMessage('user', text || (state.file ? '[Image attached]' : ''));

  const form = new FormData();
  if (text) form.append('message', text);
  form.append('session_id', state.sessionId);
  if (state.file) form.append('image', state.file, state.file.name || 'image.png');

  try {
    const controller = new AbortController();
    const TIMEOUT_MS = 95000;
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(BACKEND.replace(/\/$/, '') + '/api/agent/chat', { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const err = await res.json(); detail += ': ' + (err.error || JSON.stringify(err)); }
      catch { try { detail += ': ' + (await res.text()); } catch {} }
      throw new Error(detail);
    }
    const data = await res.json();
    state.logsText = data.logs_text || '';
    addMessage('assistant', data.final_answer || '');
    (data.artifacts || []).forEach(addArtifact);
    finalizeTimeline(data.steps || []);
  } catch (e) {
    clearTimeline();
    addTimelineItem('Error');
    addMessage('assistant', 'Error: ' + e.message);
  } finally {
    $('#text').value = '';
    clearPreview();
  }
}

function bindUI() {
  $('#send').addEventListener('click', send);
  $('#text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('#copyLogs').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.logsText || ''); addTimelineItem('Logs copied', true); } catch { addTimelineItem('Copy failed'); }
  });
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) showPreview(f); });
  $('#removePreview').addEventListener('click', clearPreview);
  $('#themeToggle').addEventListener('click', () => setTheme(!state.dark));

  // Drag & drop
  const zone = $('#chat');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); $('#dropHint').hidden = false; });
  zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); $('#dropHint').hidden = true; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('dragover'); $('#dropHint').hidden = true;
    const file = Array.from(e.dataTransfer.files || []).find(f => f.type.startsWith('image/'));
    if (file) showPreview(file);
  });

  // Paste image
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === 'file') {
        const file = it.getAsFile();
        if (file && file.type.startsWith('image/')) { showPreview(file); e.preventDefault(); break; }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTheme(false);
  bindUI();
});
