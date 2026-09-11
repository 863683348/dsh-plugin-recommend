/**
 * dsh-plugin-recommend — pure recommendation logic.
 *
 * No DSH/Cordis imports: tokenization, scoring, ranking and the live
 * awesome-README parser are unit-testable in isolation. The embedded catalog
 * (lib/catalog.json) is static data; the live refresh parses the public
 * awesome-dsh-plugin README.md into the same entry shape.
 */

/** Category ids used by the awesome list. */
export const CATEGORIES = [
  "ui", "usage", "theme", "model", "session", "memory", "tools", "vision",
  "skill", "workflow", "notify", "dev", "market", "fun",
];

const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "this", "that", "these", "those", "it", "its",
  "at", "by", "from", "as", "not", "no", "do", "does", "did", "will", "would",
  "should", "can", "could", "may", "might", "have", "has", "had", "we", "you",
  "they", "he", "she", "them", "their", "our", "your", "my", "me", "there",
  "here", "what", "which", "who", "when", "where", "why", "how", "all", "any",
  "some", "more", "most", "other", "about", "into", "than", "then", "just",
  "also", "only", "very", "such", "if", "while", "because", "so", "up", "out",
  "over", "again", "once", "dsh", "plugin", "plugins", "for", "agent", "ai",
  "deepseek", "harness",
]);

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

/**
 * Tokenize a free-text need/query into search terms.
 * CJK text becomes character bigrams; English words >= 2 chars survive
 * stopword filtering; the result is lowercased and deduplicated.
 * @param {string} query
 * @returns {string[]}
 */
export function tokenize(query) {
  const text = String(query || "").toLowerCase();
  const out = new Set();
  // CJK bigrams
  const cjkChars = text.match(CJK_RE) || [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    out.add(cjkChars[i] + cjkChars[i + 1]);
  }
  if (cjkChars.length === 1) out.add(cjkChars[0]);
  // English words
  for (const m of text.matchAll(/[a-z0-9][a-z0-9_-]*/g)) {
    const w = m[0];
    if (w.length >= 2 && !EN_STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

/**
 * Score one catalog entry against search terms.
 * @param {{n:string, u:string, c:string, d:string, t:string[]}} entry
 * @param {string[]} terms
 * @param {{category?:string}} [opts]
 * @returns {{score:number, reasons:string[]}}
 */
export function scoreEntry(entry, terms, opts = {}) {
  const { category } = opts;
  const name = entry.n.toLowerCase();
  const desc = (entry.d || "").toLowerCase();
  const tags = (entry.t || []).map((x) => x.toLowerCase());
  const hay = name + " " + desc;
  let score = 0;
  const reasons = [];
  const details = [];
  for (const term of terms) {
    const inName = name.includes(term);
    const inTag = tags.some((t) => t.includes(term) || term.includes(t));
    const inDesc = desc.includes(term);
    if (inName) { score += 3; reasons.push("name matches '" + term + "'"); details.push({ field: "name", term, weight: 3 }); }
    if (inTag) { score += 2; reasons.push("tag [" + term + "]"); details.push({ field: "tags", term, weight: 2 }); }
    else if (inDesc) { score += 1; reasons.push("description mentions '" + term + "'"); details.push({ field: "description", term, weight: 1 }); }
  }
  if (category && entry.c === category) {
    score += 2;
    reasons.push("category " + category);
    details.push({ field: "category", term: category, weight: 2 });
  }
  // tiny tiebreaker: prefer entries with more tags (richer descriptions)
  score += Math.min(tags.length, 4) * 0.01;
  const uniqueDetails = details.filter((d, i, arr) => arr.findIndex((x) => x.field === d.field && x.term === d.term) === i).slice(0, 8);
  return { score, reasons: reasons.slice(0, 6), details: uniqueDetails };
}

function termMatches(entry, terms) {
  const name = entry.n.toLowerCase();
  const desc = (entry.d || "").toLowerCase();
  const tags = (entry.t || []).map((x) => x.toLowerCase());
  let n = 0;
  for (const term of terms) {
    if (name.includes(term) || desc.includes(term) || tags.some((t) => t.includes(term) || term.includes(t))) n += 1;
  }
  return n;
}

/**
 * Rank entries by query terms.
 * @param {{n:string, u:string, c:string, d:string, t:string[]}[]} entries
 * @param {string[]} terms
 * @param {{category?:string, topN?:number, minScore?:number}} [opts]
 * @returns {Array<{n:string, u:string, c:string, d:string, t:string[], score:number, reasons:string[]}>}
 */
export function rank(entries, terms, opts = {}) {
  const { category, topN = 5, minScore = 1, diversify = false, perCategory = 2, dedupeByRepo = false } = opts;
  const scored = [];
  for (const e of entries) {
    if (category && e.c !== category) continue;
    // a result must actually match at least one term; the category bonus alone
    // must not surface irrelevant plugins
    if (termMatches(e, terms) === 0) continue;
    const { score, reasons, details } = scoreEntry(e, terms, { category });
    if (score < minScore) continue;
    scored.push({ ...e, score, reasons, details });
  }
  let pool = scored;
  if (dedupeByRepo) {
    const seen = new Set();
    pool = scored.filter((e) => {
      const key = repoKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  pool.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  if (!diversify) return pool.slice(0, topN);
  const cap = Math.max(1, Math.floor(perCategory) || 2);
  const counts = new Map();
  const picked = [];
  for (const e of pool) {
    const key = String(e.c || "");
    const seen = counts.get(key) ?? 0;
    if (seen >= cap) continue;
    counts.set(key, seen + 1);
    picked.push(e);
    if (picked.length >= topN) break;
  }
  return picked;
}

/** Dedupe key for an entry: repository url when present, else lowercased name. */
export function repoKey(entry) {
  const url = String(entry.u || "").trim().toLowerCase().replace(/\/+$/, "");
  return url.length > 0 ? url : String(entry.n || "").toLowerCase();
}

/** Drop duplicate catalog entries (same repo url or name). */
export function dedupe(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = repoKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Similarity between two catalog entries (shared tags, category, description terms). */
export function similarity(a, b) {
  const tagsA = new Set((a.t || []).map((x) => String(x).toLowerCase()));
  const sharedTags = (b.t || []).map((x) => String(x).toLowerCase()).filter((t) => tagsA.has(t));
  const sameCategory = a.c === b.c;
  const termsA = new Set(tokenize(a.d || ""));
  const overlap = [...new Set(tokenize(b.d || ""))].filter((t) => termsA.has(t));
  let score = sharedTags.length * 3 + (sameCategory ? 2 : 0) + Math.min(overlap.length, 5) * 0.5;
  const reasons = [];
  if (sharedTags.length > 0) reasons.push("shared tags: " + sharedTags.slice(0, 5).join(", "));
  if (sameCategory) reasons.push("same category (" + a.c + ")");
  if (overlap.length > 0) reasons.push("description overlap: " + overlap.slice(0, 5).join(", "));
  return { score: Math.round(score * 100) / 100, reasons, sharedTags, sameCategory, overlap };
}

/** Entries most similar to a named entry (for alternatives / same-family tools). */
export function similar(entries, name, { topN = 5 } = {}) {
  const key = String(name || "").trim().toLowerCase();
  if (key.length === 0) throw new Error("recommend: a plugin name is required for action=similar");
  const exact = entries.find((e) => String(e.n).toLowerCase() === key);
  const target = exact ?? entries.find((e) => String(e.n).toLowerCase().includes(key));
  if (!target) return { target: null, results: [] };
  const results = entries
    .filter((e) => e !== target)
    .map((e) => {
      const sim = similarity(target, e);
      return { ...e, score: sim.score, similarity: sim.score, reasons: sim.reasons, sharedTags: sim.sharedTags };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.n.localeCompare(b.n))
    .slice(0, Math.max(1, Math.floor(topN) || 5));
  return { target, results };
}

/** Category -> entry count. */
export function categoryCounts(entries) {
  const counts = {};
  for (const e of entries) counts[e.c] = (counts[e.c] || 0) + 1;
  return counts;
}

/**
 * Parse the awesome-dsh-plugin README.md into entries.
 * Format: `### <Category>` headings followed by `- [name](url) - description`
 * lines. Handles both the English README and the zh README (zh headings carry
 * an emoji prefix and are skipped in favor of en category names).
 * @param {string} md
 * @returns {{n:string, u:string, c:string, d:string}[]}
 */
export function parseAwesomeReadme(md) {
  const entries = [];
  let category = null;
  const enHeadings = new Set(CATEGORIES);
  for (const raw of String(md).split(/\r?\n/)) {
    const heading = /^###\s+(.+)$/.exec(raw.trim());
    if (heading) {
      const title = heading[1];
      const en = CATEGORIES.find((c) => title.toLowerCase().includes(c));
      category = en || null;
      continue;
    }
    if (!category) continue;
    const m = /^-\s+\[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)\s+[-—]\s+(.+)$/.exec(raw.trim());
    if (m) {
      entries.push({ n: m[1], u: m[2], c: category, d: m[3].trim().slice(0, 200) });
    }
  }
  return entries;
}

import { readFileSync } from "node:fs";

/** Load the embedded catalog JSON (created at build time). */
export function loadEmbeddedCatalog() {
  try {
    const raw = readFileSync(new URL("./catalog.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw);
    return parsed.entries || [];
  } catch {
    return [];
  }
}
