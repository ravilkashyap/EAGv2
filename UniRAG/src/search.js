export function tokenize(query) {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function includesAny(text, tokens) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

export function keywordScore(item, tokens) {
  if (tokens.length === 0) return 0;
  let score = 0;
  const title = item.title || '';
  const content = item.content || '';
  const url = item.url || '';
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerUrl = url.toLowerCase();
  for (const t of tokens) {
    if (lowerTitle.includes(t)) score += 1.5;
    if (lowerContent.includes(t)) score += 1.0;
    if (lowerUrl.includes(t)) score += 1.2;
  }
  return score;
}

export function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function blendedScore(semantic, keyword) {
  const s = isFinite(semantic) ? semantic : 0;
  const k = isFinite(keyword) ? keyword : 0;
  return 0.7 * s + 0.3 * k;
}

export function groupByType(items) {
  const groups = { tabs: [], clipboard: [], history: [], bookmarks: [], downloads: [], pinned: [] };
  for (const it of items) {
    if (it.pinned) groups.pinned.push(it);
    groups[it.type]?.push(it);
  }
  return groups;
}
