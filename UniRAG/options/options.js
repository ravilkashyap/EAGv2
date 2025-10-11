const keyEl = document.getElementById('key');
const includeHistoryEl = document.getElementById('includeHistory');
const includeBookmarksEl = document.getElementById('includeBookmarks');
const includeDownloadsEl = document.getElementById('includeDownloads');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

function setStatus(text) { statusEl.textContent = text; setTimeout(() => statusEl.textContent = '', 1500); }

function load() {
  chrome.storage.sync.get(['geminiApiKey','includeHistory','includeBookmarks','includeDownloads'], (res) => {
    keyEl.value = res.geminiApiKey || '';
    includeHistoryEl.checked = Boolean(res.includeHistory ?? true);
    includeBookmarksEl.checked = Boolean(res.includeBookmarks ?? true);
    includeDownloadsEl.checked = Boolean(res.includeDownloads ?? true);
  });
}

saveBtn.addEventListener('click', () => {
  chrome.storage.sync.set({
    geminiApiKey: keyEl.value.trim(),
    includeHistory: includeHistoryEl.checked,
    includeBookmarks: includeBookmarksEl.checked,
    includeDownloads: includeDownloadsEl.checked
  }, () => setStatus('Saved ✅'));
});

load();
