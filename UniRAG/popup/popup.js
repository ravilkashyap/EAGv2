// Add basic logging to verify popup is loading
console.log('🎯 Universal Search popup script loaded');
console.log('📅 Timestamp:', new Date().toISOString());

const resultsEl = document.getElementById('results');
const searchEl = document.getElementById('search');
const chipsEl = document.getElementById('chips');
const refineEl = document.getElementById('refine');
const aiSection = document.getElementById('ai');
const aiText = document.getElementById('ai-text');
const clearBtn = document.getElementById('clear');
// no aiActions; AI section is now a collapsible group
const roastEl = document.getElementById('roast');
const saveClipboardBtn = document.getElementById('save-clipboard');
const saveClipboardMini = document.getElementById('save-clipboard-mini');
const modal = document.getElementById('modal');
const modalLabel = document.getElementById('modal-label');
const modalContent = document.getElementById('modal-content');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const toast = document.getElementById('toast');
// Hidden command palette: type "/wipe" to clear IndexedDB
let roastCached = null;
// Clipboard refine filters: multi-select types + pinned-only toggle
let clipboardFilters = { types: new Set() };
// Unified search source filter chips (shown only when query is active)
let activeSources = new Set(['tab', 'clipboard', 'bookmark', 'history', 'download']);
let bookmarkFolderFilter = null;
let tabGroupFilter = null;
let clipboardPinnedOnly = false;

let currentFilter = 'All';
let currentItems = [];

function setToast(text) {
  toast.textContent = text;
  setTimeout(() => (toast.textContent = ''), 1500);
}

function splitPinnedAndGroups(items) {
  const pinned = [];
  const groups = new Map();
  for (const it of items) {
    const isPinned = Boolean(it.pinned);
    if (isPinned) pinned.push(it);
    const type = it.type;
    if (!groups.has(type)) groups.set(type, []);
    // avoid duplicating pinned inside normal groups
    if (!isPinned) groups.get(type).push(it);
  }
  return { pinned, groups };
}

function labelForGroup(key) {
  const map = {
    tab: 'Tabs',
    clipboard: 'Clipboard',
    bookmark: 'Bookmarks',
    history: 'History',
    download: 'Downloads'
  };
  return map[key] || (key.charAt(0).toUpperCase() + key.slice(1));
}

function isImageLike(it) {
  const c = (it.content || '').toString();
  const u = (it.url || '').toString();
  if (c.startsWith('data:image')) return true;
  if (it.source === 'Image') return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(u);
}

function persistCollapse(key, collapsed) {
  try { localStorage.setItem(`group-collapsed:${key}`, collapsed ? '1' : '0'); } catch {}
}

function restoreCollapse(key) {
  try { return localStorage.getItem(`group-collapsed:${key}`) === '1'; } catch { return false; }
}

function render(items) {
  resultsEl.innerHTML = '';
  const { pinned, groups } = splitPinnedAndGroups(items);
  try { if (refineEl) { refineEl.style.display = 'none'; refineEl.innerHTML = ''; } } catch {}

  const queryActive = (searchEl.value || '').trim().length > 0;
  if (queryActive && currentFilter === 'All') {
    // Show compact type chips and hide the primary chips row
    try { chipsEl.style.display = 'none'; } catch {}
    renderUnifiedSourceChips(items);
    // Unified results list view
    const groupEl = document.createElement('div');
    groupEl.className = 'group';
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = 'Results';
    groupEl.appendChild(title);
    // Legend for inline chips: host, folder, media type
    const legend = document.createElement('div');
    legend.className = 'chips-row';
    const hostChip = document.createElement('span'); hostChip.className = 'chip-meta'; hostChip.textContent = 'Host';
    const folderChip = document.createElement('span'); folderChip.className = 'chip-meta'; folderChip.textContent = 'Folder';
    const mediaChip = document.createElement('span'); mediaChip.className = 'chip-meta'; mediaChip.textContent = 'Media: Image / URL / Text';
    legend.appendChild(hostChip); legend.appendChild(folderChip); legend.appendChild(mediaChip);
    groupEl.appendChild(legend);
    const unified = (items || []).filter((it) => activeSources.has(it.type));
    for (const it of unified) {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      const right = document.createElement('div');
      right.className = 'actions';
      const titleEl = document.createElement('div');
      titleEl.className = 'title';
      titleEl.textContent = it.title || it.content || '(untitled)';
      const preview = document.createElement('div');
      preview.className = 'preview wrap';
      if (it.type === 'clipboard' && isImageLike(it)) {
        const img = document.createElement('img');
        const src = (it.content && it.content.startsWith('data:image')) ? it.content : (it.url || it.content || '');
        img.src = src; img.style.maxHeight = '72px'; img.style.borderRadius = '8px'; img.style.border = '1px solid #1b2533'; img.style.display = 'block';
        preview.innerHTML = '';
        preview.appendChild(img);
      } else {
        preview.textContent = it.url || it.content || '';
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${it.source || it.type} • ${new Date(it.createdAt).toLocaleString()}`;
      const chipsRow = document.createElement('div');
      chipsRow.className = 'chips-row';
      // Type chip
      const typeChip = document.createElement('span'); typeChip.className = 'chip-meta'; typeChip.textContent = (it.type || '').charAt(0).toUpperCase() + (it.type || '').slice(1);
      chipsRow.appendChild(typeChip);
      if (it.url) { try { const u = new URL(it.url); const host = document.createElement('span'); host.className = 'chip-meta'; host.textContent = u.hostname; chipsRow.appendChild(host); } catch {} }
      if (it.type === 'bookmark' && it.folder) { const chip = document.createElement('span'); chip.className = 'chip-meta'; chip.textContent = it.folder; chipsRow.appendChild(chip); }
      if (it.type === 'clipboard') {
        const c = (it.content || '').toString(); const u = (it.url || '').toString();
        const isImage = c.startsWith('data:image');
        const isUrl = /^(https?:|blob:|file:)/i.test(u || c);
        const media = isImage ? 'Image' : (isUrl ? 'URL' : 'Text');
        const mchip = document.createElement('span'); mchip.className = 'chip-meta'; mchip.textContent = media; chipsRow.appendChild(mchip);
      }

      left.appendChild(titleEl);
      left.appendChild(preview);
      left.appendChild(meta);
      if (chipsRow.children.length) left.appendChild(chipsRow);
      const openBtn = document.createElement('button');
      openBtn.className = 'btn icon';
      openBtn.title = 'Open';
      openBtn.innerHTML = '<span class="ico">↗</span>';
      openBtn.onclick = () => chrome.runtime.sendMessage({ type: 'openItem', item: it });
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn icon';
      copyBtn.innerHTML = '<span class="ico">📋</span>';
      copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(it.url || it.content || ''); setToast('Copied ✅'); spawnFlyEmoji('📋'); } catch {} };
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn icon';
      pinBtn.title = it.pinned ? 'Unpin' : 'Pin';
      pinBtn.innerHTML = `<span class="ico">${it.pinned ? '⭐' : '☆'}</span>`;
      pinBtn.onclick = async () => {
        const res = await chrome.runtime.sendMessage({ type: 'togglePin', item: it });
        if (res?.item) { it.pinned = res.item.pinned; pinBtn.innerHTML = `<span class=\"ico\">${it.pinned ? '⭐' : '☆'}</span>${it.pinned ? 'Unpin' : 'Pin'}`; }
      };
      right.appendChild(openBtn);
      right.appendChild(copyBtn);
      right.appendChild(pinBtn);
      row.appendChild(left);
      row.appendChild(right);
      groupEl.appendChild(row);
    }
    resultsEl.appendChild(groupEl);
    return;
  }
  // Not in unified view → restore primary chips, hide refine
  try { chipsEl.style.display = ''; } catch {}

  if (pinned.length) {
    const groupEl = document.createElement('div');
    groupEl.className = 'group collapsible';
    const title = document.createElement('div');
    title.className = 'group-title';
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = '▾';
    const label = document.createElement('span');
    label.textContent = 'Pinned';
    title.appendChild(caret);
    title.appendChild(label);
    title.onclick = () => { groupEl.classList.toggle('collapsed'); persistCollapse('pinned', groupEl.classList.contains('collapsed')); };
    // Expanded by default
    groupEl.appendChild(title);
    for (const it of pinned) {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      const right = document.createElement('div');
      right.className = 'actions';
      const titleEl = document.createElement('div');
      titleEl.className = 'title';
      titleEl.textContent = it.title || it.content || '(untitled)';
      const preview = document.createElement('div');
      preview.className = 'preview wrap';
      if (it.type === 'clipboard' && isImageLike(it)) {
        const img = document.createElement('img');
        const src = (it.content && it.content.startsWith('data:image')) ? it.content : (it.url || it.content || '');
        img.src = src; img.style.maxHeight = '72px'; img.style.borderRadius = '8px'; img.style.border = '1px solid #1b2533'; img.style.display = 'block';
        preview.innerHTML = '';
        preview.appendChild(img);
      } else {
        preview.textContent = it.url || it.content || '';
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${it.source || it.type} • ${new Date(it.createdAt).toLocaleString()}`;
      const chipsRow = document.createElement('div');
      chipsRow.className = 'chips-row';
      if (it.url) {
        try { const u = new URL(it.url); const host = document.createElement('span'); host.className = 'chip-meta'; host.textContent = u.hostname; chipsRow.appendChild(host); } catch {}
      }
      if (it.type === 'bookmark' && it.folder) {
        const chip = document.createElement('span'); chip.className = 'chip-meta'; chip.textContent = it.folder; chipsRow.appendChild(chip);
      }
      if (it.type === 'download' && it.content) {
        const ext = it.content.split('.').pop(); const chip = document.createElement('span'); chip.className = 'chip-meta'; chip.textContent = ext; chipsRow.appendChild(chip);
      }
      left.appendChild(titleEl);
      left.appendChild(preview);
      left.appendChild(meta);
      if (chipsRow.children.length) left.appendChild(chipsRow);
      const openBtn = document.createElement('button');
      openBtn.className = 'btn icon';
      openBtn.title = 'Open';
      openBtn.innerHTML = '<span class="ico">↗</span>';
      openBtn.onclick = () => chrome.runtime.sendMessage({ type: 'openItem', item: it });
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn icon';
      copyBtn.innerHTML = '<span class="ico">📋</span>';
      copyBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(it.url || it.content || ''); setToast('Copied ✅'); spawnFlyEmoji('📋'); } catch {}
      };
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn icon';
      pinBtn.title = it.pinned ? 'Unpin' : 'Pin';
      pinBtn.innerHTML = `<span class="ico">${it.pinned ? '⭐' : '☆'}</span>`;
      if (it.type === 'clipboard') {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn icon';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<span class="ico">🗑️</span>';
        delBtn.onclick = async () => { await chrome.runtime.sendMessage({ type: 'deleteItem', id: it.id }); doSearch(false); };
        // Move delete to the end (append after other buttons)
        right.appendChild(delBtn);
      }
      pinBtn.onclick = async () => {
        const res = await chrome.runtime.sendMessage({ type: 'togglePin', item: it });
        if (res?.item) {
          it.pinned = res.item.pinned;
          pinBtn.innerHTML = `<span class=\"ico\">${it.pinned ? '⭐' : '☆'}</span>${it.pinned ? 'Unpin' : 'Pin'}`;
        }
      };
      right.appendChild(openBtn);
      right.appendChild(copyBtn);
      right.appendChild(pinBtn);
      row.appendChild(left);
      row.appendChild(right);
      groupEl.appendChild(row);
    }
    resultsEl.appendChild(groupEl);
  }

  const order = ['tab', 'clipboard', 'bookmark', 'history', 'download'];
  for (const key of order) {
    if (!groups.has(key)) continue;
    let group = groups.get(key);
    if (key === 'clipboard') {
      // Apply type filters if any selected
      if (clipboardFilters.types && clipboardFilters.types.size > 0) {
      group = group.filter((ci) => {
        const c = ci.content || '';
        const u = ci.url || '';
          const isImage = c.startsWith('data:image');
          const isUrl = /^(https?:|blob:|file:)/i.test(u || c);
          const isText = !isImage && !isUrl;
          return (
            (clipboardFilters.types.has('image') && isImage) ||
            (clipboardFilters.types.has('url') && isUrl) ||
            (clipboardFilters.types.has('text') && isText)
          );
        });
      }
    }
    if (key === 'bookmark' && bookmarkFolderFilter) {
      group = group.filter((ci) => (ci.folder || '') === bookmarkFolderFilter);
    }
    if (key === 'tab' && tabGroupFilter) {
      group = group.filter((ci) => (ci.groupTitle || '') === tabGroupFilter);
    }
    // handled above
    if (!group || group.length === 0) continue;
    const groupEl = document.createElement('div');
    groupEl.className = 'group collapsible';
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = labelForGroup(key);
    const caret = document.createElement('span'); caret.className = 'caret'; caret.textContent = '▾';
    title.prepend(caret);
    title.onclick = () => { groupEl.classList.toggle('collapsed'); persistCollapse(key, groupEl.classList.contains('collapsed')); };
    const collapsed = restoreCollapse(key);
    // Keep Tabs expanded by default for better visibility
    if (collapsed && key !== 'tab') groupEl.classList.add('collapsed');
    groupEl.appendChild(title);
    for (const it of group) {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      const right = document.createElement('div');
      right.className = 'actions';
      const titleEl = document.createElement('div');
      titleEl.className = 'title';
      titleEl.textContent = it.title || it.content || '(untitled)';
      const preview = document.createElement('div');
      preview.className = 'preview wrap';
      if (it.type === 'clipboard' && isImageLike(it)) {
        const img = document.createElement('img');
        const src = (it.content && it.content.startsWith('data:image')) ? it.content : (it.url || it.content || '');
        img.src = src; img.style.maxHeight = '72px'; img.style.borderRadius = '8px'; img.style.border = '1px solid #1b2533'; img.style.display = 'block';
        preview.innerHTML = '';
        preview.appendChild(img);
      } else {
        preview.textContent = it.url || it.content || '';
      }
      const chipsRow2 = document.createElement('div'); chipsRow2.className = 'chips-row';
      if (it.url) { try { const u = new URL(it.url); const host = document.createElement('span'); host.className = 'chip-meta'; host.textContent = u.hostname; chipsRow2.appendChild(host); } catch {} }
      if (it.type === 'bookmark' && it.folder) { const chip = document.createElement('span'); chip.className = 'chip-meta'; chip.textContent = it.folder; chipsRow2.appendChild(chip); }
      if (it.type === 'clipboard') { const c = (it.content || '').toString(); const u = (it.url || '').toString(); const isImage = c.startsWith('data:image'); const isUrl = /^(https?:|blob:|file:)/i.test(u || c); const media = isImage ? 'Image' : (isUrl ? 'URL' : 'Text'); const mchip = document.createElement('span'); mchip.className = 'chip-meta'; mchip.textContent = media; chipsRow2.appendChild(mchip); }

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${it.source || it.type} • ${new Date(it.createdAt).toLocaleString()}`;
      left.appendChild(titleEl);
      left.appendChild(preview);
      left.appendChild(meta);
      if (chipsRow2.children.length) left.appendChild(chipsRow2);
      const openBtn = document.createElement('button');
      openBtn.className = 'btn icon';
      openBtn.title = 'Open';
      openBtn.innerHTML = '<span class="ico">↗</span>';
      openBtn.onclick = () => chrome.runtime.sendMessage({ type: 'openItem', item: it });
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn icon';
      copyBtn.innerHTML = '<span class="ico">📋</span>';
      copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(it.url || it.content || ''); setToast('Copied ✅'); spawnFlyEmoji('📋'); } catch {} };
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn icon';
      pinBtn.title = it.pinned ? 'Unpin' : 'Pin';
      pinBtn.innerHTML = `<span class="ico">${it.pinned ? '⭐' : '☆'}</span>`;
      if (it.type === 'clipboard') {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn icon';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<span class="ico">🗑️</span>';
        delBtn.onclick = async () => { await chrome.runtime.sendMessage({ type: 'deleteItem', id: it.id }); doSearch(); };
        right.appendChild(delBtn);
      }
      pinBtn.onclick = async () => {
        const res = await chrome.runtime.sendMessage({ type: 'togglePin', item: it });
        if (res?.item) {
          it.pinned = res.item.pinned;
          pinBtn.innerHTML = `<span class=\"ico\">${it.pinned ? '⭐' : '☆'}</span>${it.pinned ? 'Unpin' : 'Pin'}`;
        }
      };
      right.appendChild(openBtn);
      right.appendChild(copyBtn);
      right.appendChild(pinBtn);
      row.appendChild(left);
      row.appendChild(right);
      groupEl.appendChild(row);
    }
    resultsEl.appendChild(groupEl);
  }
}

async function doSearch(withAI = false) {
  const query = searchEl.value.trim();
  if (query) roastEl.classList.add('hidden');
  const res = await chrome.runtime.sendMessage({ type: 'search', query, filter: currentFilter });
  currentItems = res?.items || [];
  let showedNoResults = false;
  if (!currentItems.length && query && currentFilter === 'All') {
    resultsEl.innerHTML = '<div class="group"><div class="group-title">No results</div></div>';
    showedNoResults = true;
  }
  if (currentItems.length) render(currentItems);
  if (withAI) {
    // Render AI inside the scrollable results area for consistency
    try { resultsEl.prepend(aiSection); } catch {}
    aiSection.classList.remove('hidden');
    // allow toggle like other groups (bind once)
    const header = aiSection.querySelector('.group-title');
    if (!header.dataset.bound) { header.onclick = () => aiSection.classList.toggle('collapsed'); header.dataset.bound = '1'; }
    aiText.innerHTML = '<p>Thinking…</p>';

    // Add 3-second delay before making AI API call
    setTimeout(async () => {
      try {
        const ans = await chrome.runtime.sendMessage({ type: 'aiAnswer', query, items: currentItems.slice(0, 15) });
        const out = ans?.text || generateLocalAiFallback(query, currentItems);

        // Check if we have a meaningful response
        if (out && out.trim() && out.trim() !== '' && !out.includes('No API key configured') && !out.includes('Error generating AI response')) {
          // If model returned HTML, render directly; else fallback to markdown rendering
          if (/<\w+[^>]*>/.test(out)) {
            aiText.innerHTML = out;
          } else {
            aiText.innerHTML = renderMarkdown(out);
          }
        } else {
          // No meaningful response, hide the AI section
          aiSection.classList.add('hidden');
        }
      } catch (error) {
        aiSection.classList.add('hidden');
      }
    }, 3000); // 3 second delay
  } else {
    aiSection.classList.add('hidden');
    if (!query) showRoastOnOpen();
  }
}

function renderUnifiedSourceChips(items) {
  if (!refineEl) return;
  refineEl.innerHTML = '';
  refineEl.style.display = '';
  const present = new Set((items || []).map(it => it.type));
  const make = (key, label) => {
    const b = document.createElement('button');
    b.className = 'chip';
    const on = present.has(key) && activeSources.has(key);
    if (on) b.classList.add('active');
    b.textContent = label;
    if (present.has(key)) {
      b.onclick = () => { if (activeSources.has(key)) activeSources.delete(key); else activeSources.add(key); doSearch(false); };
    } else {
      b.disabled = true; b.style.opacity = '0.5';
    }
    refineEl.appendChild(b);
  };
  make('tab', 'Tabs');
  make('clipboard', 'Clipboard');
  make('history', 'History');
  make('bookmark', 'Bookmarks');
  make('download', 'Downloads');
}

// AI actions removed per design simplification

function generateLocalAiFallback(query, items) {
  try {
    // Don't generate fallback content when AI fails - just return empty
    // This prevents showing static search results as AI responses
    return '';
  } catch { return ''; }
}

function renderMarkdown(text) {
  // Minimal markdown to HTML: headings, bullets, emphasis, code inline/blocks, links
  try {
    let html = text || '';
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${escapeHtml(code)}</code></pre>`);
    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/^\-\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[(.*?)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>');
    // Wrap loose list items into a ul
    html = html.replace(/(<li>.*?<\/li>)(?!(?:\s*<li>|\s*<\/ul>))/gs, '$1');
    html = html.replace(/(?:^|\n)(<li>.*?<\/li>)/gs, (m) => `<ul>${m}</ul>`);
    // Convert remaining lines to paragraphs
    html = html.split(/\n{2,}/).map(p => /<(h\d|ul|pre)/.test(p) ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
    return html;
  } catch { return text; }
}

function escapeHtml(s) { return (s || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function renderRefineChips(groups) {
  try {
    refineEl.innerHTML = '';
    refineEl.style.display = 'none';
    const addChip = (label, onClick, active) => {
      const b = document.createElement('button');
      b.className = 'chip';
      if (active) b.classList.add('active');
      b.textContent = label;
      b.onclick = onClick;
      refineEl.appendChild(b);
    };
    // Clipboard subtype chips only when Clipboard filter is active
    if (currentFilter.toLowerCase() === 'clipboard' && groups.has('clipboard')) {
      refineEl.style.display = '';
      // Pinned default: on (no AI calls on toggle)
      addChip(clipboardFilters.pinnedOnly ? 'Pinned ✓' : 'Pinned', () => { clipboardFilters.pinnedOnly = !clipboardFilters.pinnedOnly; doSearch(false); }, clipboardFilters.pinnedOnly);
      const toggleType = (t) => () => { if (clipboardFilters.types.has(t)) clipboardFilters.types.delete(t); else clipboardFilters.types.add(t); doSearch(false); };
      addChip(clipboardFilters.types.has('image') ? 'Images ✓' : 'Images', toggleType('image'), clipboardFilters.types.has('image'));
      addChip(clipboardFilters.types.has('url') ? 'URLs ✓' : 'URLs', toggleType('url'), clipboardFilters.types.has('url'));
      addChip(clipboardFilters.types.has('text') ? 'Text ✓' : 'Text', toggleType('text'), clipboardFilters.types.has('text'));
    }
    // Future: enable bookmark folders or tab groups when those filters are active
  } catch {}
}

function setActiveChip(key) {
  for (const c of chipsEl.querySelectorAll('.chip')) c.classList.remove('active');
  const btn = Array.from(chipsEl.querySelectorAll('.chip')).find(b => (b.dataset.filter || '').toLowerCase() === key);
  if (btn) btn.classList.add('active');
}

// Paste image support
document.addEventListener('paste', async (e) => {
  const item = e.clipboardData?.items?.[0];
  if (item && item.type.startsWith('image/')) {
    const file = item.getAsFile();
    const reader = new FileReader();
    reader.onload = async () => {
      // Open modal with image data URL prefilled for label input
      try { await chrome.storage.local.set({ pendingAdd: { type: 'image', content: reader.result, label: 'Image' } }); } catch {}
      await openAddModal();
    };
    reader.readAsDataURL(file);
  }
});
async function showRoastOnOpen() {
  if (searchEl.value.trim()) return;
  try {
    if (roastCached) { roastEl.classList.remove('hidden'); roastEl.textContent = roastCached; return; }
    const ans = await chrome.runtime.sendMessage({ type: 'roast' });
    let text = ans?.text || '';
    if (!text) text = await generateLocalRoast();
    roastCached = addRoastEmoji(text);
    roastEl.classList.remove('hidden');
    roastEl.textContent = roastCached;
  } catch {}
}

async function generateLocalRoast() {
  const tabs = await chrome.tabs.query({});
  const active = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const count = tabs.length;
  const hostnames = Array.from(new Set(tabs.map(t => { try { return new URL(t.url||'').hostname; } catch { return ''; } }).filter(Boolean)));
  const activeHost = (() => { try { return new URL(active?.url||'').hostname; } catch { return ''; } })();
  const activeTitle = active?.title || activeHost || 'this tab';
  const isMlLearner = hostnames.some(h => /arxiv\.org|pytorch\.org|tensorflow\.org|huggingface\.co|kaggle\.com|paperswithcode\.com|colab\.research\.google\.com/i.test(h));
  const patterns = [
    () => `You’ve got ${count} tabs across ${hostnames.length} domains — curiosity in action.`,
    () => `Still on “${truncate(activeTitle, 32)}”? Nice focus. The other ${Math.max(0, count - 1)} can wait.`,
    () => `${capitalize(activeHost || 'the web')} has your attention today. Great progress — keep going.`,
    () => `Tabs open: ${count}. Close one you’re done with and keep the momentum.`,
    () => `Your browser looks like a learning lab. Pick one next action and ship it.`,
    () => `Deep learning on your radar? Small steps add up — try one experiment today.`,
    () => `Those ML papers look great — jot one takeaway, then continue strong.`,
    () => `Transformers on screen; your attention is the real superpower.`,
    () => `Studying mode: on. Capture one insight before you move to the next tab.`
  ];
  const pool = isMlLearner ? patterns : patterns.slice(0, 5);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick();
}

function truncate(s, n) { return (s && s.length > n) ? s.slice(0, n - 1) + '…' : s; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function addRoastEmoji(text) {
  const emojis = ['🔥', '🧠', '🫠', '🌀', '😵‍💫', '⚡'];
  const e = emojis[Math.floor(Math.random() * emojis.length)];
  return `${e} ${text}`;
}

function spawnFlyEmoji(char) {
  const el = document.createElement('div');
  el.className = 'fly';
  el.textContent = char;
  document.body.appendChild(el);
  const rect = saveClipboardBtn.getBoundingClientRect();
  el.style.left = rect.left + 'px';
  el.style.top = rect.top + 'px';
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(520px, -520px) scale(0.6)';
  });
  setTimeout(() => el.remove(), 700);
}

showRoastOnOpen();
// On initial open with empty query, show pinned items immediately
if (!searchEl.value.trim()) {
  (async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getPinnedOnOpen' });
      if (Array.isArray(res?.items) && res.items.length) {
        currentItems = res.items;
        render(currentItems);
      }
      // Also, if context menu initiated a save, open the modal immediately
      const { pendingAdd } = await chrome.storage.local.get(['pendingAdd']);
      if (pendingAdd && pendingAdd.content) {
        await openAddModal();
      }
    } catch {}
  })();
}

// Debounced search for smoother typing (no AI during input)
let searchDebounce = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => doSearch(false), 160);
});
searchEl.addEventListener('keydown', async (e) => {
  const items = Array.from(document.querySelectorAll('.item'));
  const focusIdx = items.findIndex((el) => el.classList.contains('focus'));
  if (e.key === 'Enter' && searchEl.value.trim() === '/wipe') {
    e.preventDefault();
    try { await chrome.runtime.sendMessage({ type: 'wipeDb' }); setToast('Database cleared'); } catch { setToast('Failed to clear DB'); }
    searchEl.value = '';
    await doSearch(false);
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = items[Math.min((focusIdx + 1), items.length - 1)] || items[0];
    items.forEach((el) => el.classList.remove('focus'));
    next.classList.add('focus');
    next.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = items[Math.max((focusIdx - 1), 0)] || items[0];
    items.forEach((el) => el.classList.remove('focus'));
    prev.classList.add('focus');
    prev.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const current = items[focusIdx >= 0 ? focusIdx : 0];
    const query = searchEl.value.trim();
    if (e.metaKey || e.ctrlKey) {
    current?.querySelector('.actions .btn')?.click();
      return;
    }
    e.preventDefault();
    // Ensure we summarize across everything
    if (currentFilter !== 'All') {
      currentFilter = 'All';
      setActiveChip('all');
    }
    await doSearch(true);
    try { aiSection.classList.remove('hidden'); aiSection.scrollIntoView({ block: 'nearest' }); } catch {}
  } else if (e.key.toLowerCase() === 'p') {
    const current = items[focusIdx >= 0 ? focusIdx : 0];
    current?.querySelector('.actions .btn:last-child')?.click();
  }
});

chipsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const c of chipsEl.querySelectorAll('.chip')) c.classList.remove('active');
  btn.classList.add('active');
  currentFilter = btn.dataset.filter || 'All';
  // No legacy clipboardTypeView anymore
  doSearch(false);
});

clearBtn?.addEventListener('click', () => { searchEl.value = ''; doSearch(false); showRoastOnOpen(); });
// Full storage flush helper
clearBtn?.addEventListener('dblclick', async () => {
  try { localStorage.clear(); } catch {}
  try { await chrome.storage.local.clear(); } catch {}
  setToast('Storage cleared');
});

if (saveClipboardBtn) {
  saveClipboardBtn.addEventListener('click', async () => {
    await openAddModal();
  });
}

saveClipboardMini?.addEventListener('click', async () => {
  await openAddModal();
});

async function openAddModal() {
  try {
    // If background requested a pending add, prefill from it
    const { pendingAdd } = await chrome.storage.local.get(['pendingAdd']);
    if (pendingAdd && pendingAdd.content) {
      modalLabel.value = (pendingAdd.label || '').toString();
      modalContent.value = pendingAdd.content || '';
      try { await chrome.storage.local.remove('pendingAdd'); } catch {}
    } else {
    const text = await navigator.clipboard.readText();
    modalLabel.value = '';
    modalContent.value = text || '';
    }
    modal.classList.add('show');
  } catch { modal.classList.add('show'); }
}

modalCancel?.addEventListener('click', () => modal.classList.remove('show'));
modalSave?.addEventListener('click', async () => {
  try {
    const text = modalContent.value.trim();
    if (!text) return setToast('Nothing to save');
    const label = modalLabel.value.trim();
    // Save either image/data URL or text/URL depending on content
    let ok = true;
    if (text.startsWith('data:image')) {
      const res = await chrome.runtime.sendMessage({ type: 'saveClipboardImage', dataUrl: text });
      ok = !!res?.ok;
    } else if (/^https?:/i.test(text) && /\.(png|jpe?g|gif|webp|svg)$/i.test(text)) {
      const res = await chrome.runtime.sendMessage({ type: 'saveClipboardUrl', url: text, kind: label || 'Image' });
      ok = !!res?.ok;
    } else if (/^https?:/i.test(text)) {
      const res = await chrome.runtime.sendMessage({ type: 'saveClipboardUrl', url: text, kind: label || 'Link' });
      ok = !!res?.ok;
    } else {
      const res = await chrome.runtime.sendMessage({ type: 'saveClipboardText', text, label });
      ok = !!res?.ok;
    }
    if (!ok) throw new Error('Save failed');
    setToast('Saved ✅');
    modal.classList.remove('show');
    spawnFlyEmoji('📥');
    doSearch();
  } catch { setToast('Failed to save'); }
});

// Enter key should submit the modal when it's open
modalContent?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
    e.preventDefault();
    modalSave?.click();
  }
});

doSearch();
