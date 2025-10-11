const EMBEDDING_MODEL = 'text-embedding-004';
const SUMMARIZER_MODEL = 'gemini-1.5-flash';

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['geminiApiKey'], (res) => resolve(res.geminiApiKey || ''));
  });
}

export async function fetchEmbedding(text) {
  const apiKey = await getApiKey();
  if (!apiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedText?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const values = data?.embedding?.values || data?.embedding?.value || data?.data?.[0]?.embedding?.values || [];
  return Array.isArray(values) ? values : null;
}

export async function summarizeAnswer(query, snippets) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return 'No API key configured. Please set up your Gemini API key in the extension options.';
  }
  const hasContext = Array.isArray(snippets) && snippets.length > 0;

  // Special handling for music queries
  const isMusicQuery = /\b(song|songs|music|track|tracks|listen|listened|play|played|spotify|youtube music|apple music|soundcloud|album|artist|band|concert|dj|radio|streaming|playlist)\b/i.test(query);
  const hasMusicContent = hasContext && snippets.some(s => s.type === 'music' || (s.title && /\b(song|songs|music|track|tracks|listen|listened|play|played|spotify|youtube music|apple music|soundcloud|album|artist|band|concert|dj|radio|streaming|playlist)\b/i.test(s.title)));

  // Compact and truncate snippets to avoid exceeding model limits
  const maxItems = isMusicQuery ? 20 : 12;
  const compact = (snippets || []).slice(0, maxItems).map((s, i) => {
    const type = String(s.type || '').slice(0, 16);
    const title = String(s.title || '').slice(0, 200);
    const url = String(s.url || '').slice(0, 180);
    const date = String(s.createdAt || '').slice(0, 32);
    return `${i + 1}) [${type}] • ${title}${url ? ` • ${url}` : ''}${date ? ` • ${date}` : ''}`;
  });
  const contextBlock = hasContext ? `Context snippets (type • title • url • date):\n${compact.join('\n')}` : `No snippets provided.`;

  let taskInstruction = `You are Chronos, a helpful assistant. Based on the user's browsing history and the provided context, give a detailed answer about their music listening activity.

For music queries, format the response as:
"In the last 3 days, you have listened to the following songs:
• Song Name 1 - [Platform] - Date
• Song Name 2 - [Platform] - Date
• etc."

Include reference links to the actual tabs/results where possible. If there are YouTube/YouTube Music tabs related to these songs, mention them as well.

Keep the response friendly and informative.`;

  if (isMusicQuery && !hasMusicContent) {
    taskInstruction = `The user is asking about music/songs they've listened to. If no music-related content is found in the context, provide a helpful response explaining that no recent music listening activity was detected, and suggest ways they can track their music listening (like using music streaming apps with history features).\n\n${taskInstruction}`;
  }

  const prompt = `You are Chronos, a helpful assistant.\n\nTask: ${taskInstruction}\n\nDo not list raw snippet lines.\n\nUser: "${query}"\n\n${contextBlock}\n\nRespond with clean HTML (no code fences). Use <p>, <ul>, <li>, <a href>, <strong>. Keep tone friendly and concise.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARIZER_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  async function callModel(textPrompt) {
    const controller = new AbortController();
    const body = { contents: [ { parts: [{ text: textPrompt }] } ] };

    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        return '';
      }

      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.map(p => p?.text || '').filter(Boolean).join('\n');
    } catch (error) {
      clearTimeout(timeoutId);
      return '';
    }
  }

  // Check if we have music data and should return formatted response
  if (isMusicQuery && hasMusicContent && snippets.length > 0) {
    // Generate custom formatted response for music queries
    const musicItems = snippets.filter(s => s.type === 'music');
    if (musicItems.length > 0) {
      const formattedSongs = musicItems.map((item, index) => {
        const date = new Date(item.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const platform = item.source || 'YouTube';
        return `<li>• <a href="${item.url}" target="_blank">${item.title}</a> - ${platform} - ${date}</li>`;
      }).join('\n');

      const response = `<p>Based on your browsing history, these are the songs you have listened to:</p>
<ul style="margin: 0; padding-left: 20px;">
${formattedSongs}
</ul>
<p style="margin-top: 12px; color: #666; font-size: 14px;"></p>`;

      return response;
    }
  }

  // First attempt with full context
  let out = await callModel(prompt);
  if (out && out.trim()) return out;

  // Fallback attempt: include some context if available
  if (hasContext && snippets.length > 0) {
    const fallbackContext = snippets.slice(0, 5).map((s, i) =>
      `${i + 1}) [${s.type}] ${s.title || ''}${s.url ? ` - ${s.url}` : ''}`
    ).join('\n');
    const fallbackPrompt = `You are Chronos. Answer based on the following context:\n\n${fallbackContext}\n\nQuestion: "${query}"\n\nRespond with clean HTML.`;
    out = await callModel(fallbackPrompt);
    if (out && out.trim()) return out;
  }

  // Final fallback: minimal general-knowledge prompt
  const fallback = `You are Chronos. Answer this clearly in HTML.\n\nQuestion: "${query}"`;
  out = await callModel(fallback);
  return out || '';
}
