const BACKEND = 'http://localhost:8000';
const $ = (sel) => document.querySelector(sel);

const state = {
  sessionId: crypto.randomUUID(),
  logsText: '',
  attachments: [],
  dark: false,
  busy: false,
  lastSteps: [],
};

function scrollToEnd(){ const chat=$('#messages'); chat?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'end'}); }

function setTheme(dark, persist=true) {
  state.dark = dark;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  $('#themeToggle').textContent = dark ? '☀' : '☾';
  if (persist && chrome?.storage?.local) chrome.storage.local.set({ themeDark: dark });
}

function initTheme() {
  if (chrome?.storage?.local) {
    chrome.storage.local.get(['themeDark'], (cfg) => {
      if (typeof cfg.themeDark === 'boolean') setTheme(cfg.themeDark, false);
      else setTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });
  } else {
    setTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches, false);
  }
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; setTimeout(() => { t.hidden = true; }, 3000); }

function renderChips() {
  const box = $('#chips'); box.innerHTML = '';
  state.attachments.forEach((a, idx) => {
    const chip = document.createElement('span'); chip.className = 'chip';
    const img = document.createElement('img'); img.src = a.url; img.alt = 'attachment'; img.addEventListener('click', () => openImg(a.url));
    const name = document.createElement('span'); name.textContent = a.file.name || 'image';
    const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Remove'; x.addEventListener('click', () => { state.attachments.splice(idx,1); renderChips(); });
    chip.appendChild(img); chip.appendChild(name); chip.appendChild(x); box.appendChild(chip);
  });
}

function openImg(url) { $('#imgPreview').src = url; $('#imgModal').hidden = false; }
function bindImgModal() { $('#closeImg').addEventListener('click', () => { $('#imgModal').hidden = true; }); }

function addUserBubble(text, images=[]) {
  const wrap = document.createElement('div'); wrap.className = 'message user';
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = 'U';
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  if (text) { const p = document.createElement('div'); p.innerText = text; bubble.appendChild(p); }
  images.forEach((url) => { const img = document.createElement('img'); img.src = url; img.style.maxWidth='240px'; img.style.borderRadius='8px'; img.style.display='block'; img.addEventListener('click', () => openImg(url)); bubble.appendChild(img); });
  wrap.appendChild(avatar); wrap.appendChild(bubble); $('#messages').appendChild(wrap); scrollToEnd();
}

function formatRichText(text){
  const esc = (s)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let t = esc(text || '');
  // headings: ###, ##, # to h3/h2/h1-like spans
  t = t.replace(/^###\s*(.*)$/gm, '<div class="h3">$1</div>');
  t = t.replace(/^##\s*(.*)$/gm, '<div class="h2">$1</div>');
  t = t.replace(/^#\s*(.*)$/gm, '<div class="h1">$1</div>');
  // bold
  t = t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  // bullets
  t = t.replace(/\n- (.*?)(?=\n|$)/g,'<br>• $1');
  // simple numbered list support
  t = t.replace(/\n(\d+)\.\s+/g, (m, d)=>`<br>${d}. `);
  // inline/block math
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, '<div class="math">$1</div>');
  t = t.replace(/\$(.+?)\$/g, '<span class="math">$1</span>');
  // Support \( ... \) and \[ ... \]
  t = t.replace(/\\\((.+?)\\\)/g, '<span class="math">$1</span>');
  t = t.replace(/\\\[([\s\S]+?)\\\]/g, '<div class="math">$1</div>');
  // paragraphs
  t = t.replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  return t;
}

function renderMath(root){
  try {
    if (!window.katex) return;
    const nodes = root.querySelectorAll('.math');
    nodes.forEach((el) => {
      const displayMode = el.tagName.toLowerCase() === 'div';
      const tex = el.textContent || '';
      try { window.katex.render(tex, el, { displayMode, throwOnError: false, trust: true }); } catch {}
    });
  } catch {}
}

function addAssistantBubble(text, withActions=false) {
  const wrap = document.createElement('div'); wrap.className = 'message assistant';
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = 'A';
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerHTML = formatRichText(text);
  wrap.appendChild(avatar); wrap.appendChild(bubble); $('#messages').appendChild(wrap);
  renderMath(bubble);
  if (withActions) {
    const bar = document.createElement('div'); bar.className = 'actionbar assistant';
    const info = document.createElement('button'); info.textContent = 'ℹ︎'; info.title='View details';
    const localSteps = (state.lastSteps || []).slice();
    info.addEventListener('click', () => openStepsModal(localSteps));
    const cpy = document.createElement('button'); cpy.textContent='⎘'; cpy.title='Copy text'; cpy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } });
    bar.appendChild(info); bar.appendChild(cpy);
    $('#messages').appendChild(bar);
  }
  scrollToEnd();
}

function renderStepCards(steps){
  const container = $('#stepsContainer'); container.innerHTML='';
  (steps||[]).forEach((s, idx) => {
    const card = document.createElement('div'); card.className='card';
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); left.className='left';
    const isError = String(s.tool_result_summary||'').startsWith('Tool error') || String(s.llm_response||'').includes('Unknown tool');
    const chip = document.createElement('span'); chip.className = 'tool-chip ' + (isError?'err':'ok'); chip.textContent = s.tool_call? s.tool_call.name : 'LLM';
    const title = document.createElement('span'); title.textContent = `Step ${s.iteration}`;
    left.appendChild(chip); left.appendChild(title);
    const togg = document.createElement('button'); togg.className='tog'; togg.textContent='▸';
    row.appendChild(left); row.appendChild(togg);
    const args = document.createElement('div'); args.className='args'; args.textContent = s.tool_call ? JSON.stringify(s.tool_call.args||{}, null, 2) : '-';
    const txt = document.createElement('div'); txt.className='meta'; txt.textContent = s.tool_result_summary || s.llm_response;
    card.appendChild(row); card.appendChild(txt); card.appendChild(args);
    togg.addEventListener('click', () => { card.classList.toggle('open'); togg.textContent = card.classList.contains('open') ? '▾' : '▸'; });
    container.appendChild(card);
  });
}

function openStepsModal(steps){
  renderStepCards(steps);
  $('#stepsModal').hidden = false;
}

async function copyAllSteps(){
  const lines = (state.lastSteps || []).map((s) => {
    const tool = s.tool_call ? `${s.tool_call.name} ${JSON.stringify(s.tool_call.args||{})}` : 'None';
    return `Step ${s.iteration}: ${s.llm_response}\n  Tool: ${tool}\n  Result: ${s.tool_result_summary || ''}`;
  }).join('\n\n');
  try { await navigator.clipboard.writeText(lines); toast('Steps copied'); } catch { toast('Copy failed'); }
}

function buildDetailLines(steps){
  return (steps || []).map((s) => {
    const ok = !(String(s.tool_result_summary||'').startsWith('Tool error'));
    const chip = `<span class="tool-chip ${ok?'ok':'err'}">${s.tool_call? s.tool_call.name : 'LLM'}</span>`;
    const args = s.tool_call ? ` args: ${JSON.stringify(s.tool_call.args||{})}` : '';
    return `${chip} ${args}\n${s.llm_response}\n${s.tool_result_summary||''}`;
  }).join('\n\n');
}

function toggleInlineDetails(anchor, steps){
  let next = anchor.nextElementSibling;
  if (next && next.classList.contains('details')) { next.remove(); return; }
  const div = document.createElement('div'); div.className = 'details';
  const pre = document.createElement('pre'); pre.className = 'steps'; pre.innerHTML = buildDetailLines(steps);
  div.appendChild(pre);
  anchor.parentNode.insertBefore(div, anchor.nextSibling);
  scrollToEnd();
}

function typingIndicator(){
  const wrap = document.createElement('div'); wrap.className='message assistant';
  const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent='A';
  const bubble = document.createElement('div'); bubble.className='bubble';
  const label = document.createElement('div'); label.className='meta'; label.textContent='Analyzing…';
  const t = document.createElement('div'); t.className='typing'; t.innerHTML='<span></span><span></span><span></span>';
  bubble.appendChild(label); bubble.appendChild(t); wrap.appendChild(avatar); wrap.appendChild(bubble); $('#messages').appendChild(wrap);
  scrollToEnd();
  return { node: wrap, set: (txt)=>{ label.textContent = txt; } };
}

function clearTimeline() { /* hidden */ }
function startTimeline() { /* replaced by typing indicator */ }
function finalizeTimeline() { /* no-op */ }

async function send() {
  if (state.busy) return;
  const textEl = $('#text');
  const text = textEl.value.trim();
  if (!text && state.attachments.length === 0) return;
  state.busy = true; $('#send').setAttribute('disabled', '');
  addUserBubble(text, state.attachments.map(a=>a.url));
  textEl.value = '';
  const dh = $('#dropHint'); if (dh) dh.hidden = true;
  const typing = typingIndicator();
  const form = new FormData(); if (text) form.append('message', text); form.append('session_id', state.sessionId); if (state.attachments[0]) form.append('image', state.attachments[0].file, state.attachments[0].file.name || 'image.png');
  try {
    const controller = new AbortController();
    const TIMEOUT_MS = 95000; // align with server AGENT_TIMEOUT_SECONDS default
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(BACKEND.replace(/\/$/, '') + '/api/agent/chat', { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const err = await res.json(); detail += ': ' + (err.error || JSON.stringify(err)); }
      catch { try { detail += ': ' + (await res.text()); } catch {} }
      throw new Error(detail);
    }
    const data = await res.json(); state.lastSteps = data.steps || []; typing.node.remove(); addAssistantBubble(data.final_answer || '', true); (data.artifacts || []).forEach(addArtifact);
  } catch (e) { typing.node.remove(); addAssistantBubble('Error: ' + (e.name === 'AbortError' ? 'Request timed out' : e.message)); }
  finally { state.busy = false; $('#send').removeAttribute('disabled'); state.attachments = []; renderChips(); scrollToEnd(); }
}

function addArtifact(artifact) { if (artifact.type !== 'image') return; const wrap = document.createElement('div'); wrap.className = 'artifact'; const img = document.createElement('img'); img.src = BACKEND.replace(/\/$/, '') + artifact.url; wrap.appendChild(img); const cap = document.createElement('div'); cap.className = 'caption'; cap.textContent = artifact.caption || ''; wrap.appendChild(cap); $('#messages').appendChild(wrap); scrollToEnd(); }

function checkHealth() { const banner = $('#health'); banner.hidden = false; banner.textContent = 'Connecting to backend…'; fetch(BACKEND + '/health').then(r => { banner.textContent = r.ok ? 'Backend connected' : 'Backend not reachable'; setTimeout(() => { banner.hidden = true; }, 1200); }).catch(() => { banner.textContent = 'Backend not reachable'; }); }

function bindUI() {
  $('#send').addEventListener('click', send);
  $('#text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) { const url = URL.createObjectURL(f); state.attachments=[{file:f, url}]; renderChips(); } });
  $('#themeToggle').addEventListener('click', () => setTheme(!state.dark));
  $('#copyStepsHdr').addEventListener('click', copyAllSteps);
  $('#expandAll').addEventListener('click', () => { document.querySelectorAll('#stepsContainer .card').forEach(c=>c.classList.add('open')); });
  $('#collapseAll').addEventListener('click', () => { document.querySelectorAll('#stepsContainer .card').forEach(c=>c.classList.remove('open')); });
  $('#closeSteps').addEventListener('click', () => { $('#stepsModal').hidden = true; });

  // paste into textarea (images)
  $('#text').addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === 'file') {
        const file = it.getAsFile();
        if (file && file.type.startsWith('image/')) { const url = URL.createObjectURL(file); state.attachments=[{file, url}]; renderChips(); e.preventDefault(); break; }
      }
    }
  });

  bindImgModal();

  const zone = $('#chat');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); const file = Array.from(e.dataTransfer.files || []).find(f => f.type.startsWith('image/')); if (file) { const url = URL.createObjectURL(file); state.attachments=[{file, url}]; renderChips(); } });
}

document.addEventListener('DOMContentLoaded', () => { initTheme(); bindUI(); checkHealth(); });
