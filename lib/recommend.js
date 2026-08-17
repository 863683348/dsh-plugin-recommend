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
  for (const term of terms) {
    const inName = name.includes(term);
    const inTag = tags.some((t) => t.includes(term) || term.includes(t));
    const inDesc = desc.includes(term);
    if (inName) { score += 3; reasons.push("name matches '" + term + "'"); }
    if (inTag) { score += 2; reasons.push("tag [" + term + "]"); }
    else if (inDesc) { score += 1; reasons.push("description mentions '" + term + "'"); }
  }
  if (category && entry.c === category) {
    score += 2;
    reasons.push("category " + category);
  }
  // tiny tiebreaker: prefer entries with more tags (richer descriptions)
  score += Math.min(tags.length, 4) * 0.01;
  return { score, reasons: reasons.slice(0, 6) };
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
  const { category, topN = 5, minScore = 1 } = opts;
  const scored = [];
  for (const e of entries) {
    if (category && e.c !== category) continue;
    // a result must actually match at least one term; the category bonus alone
    // must not surface irrelevant plugins
    if (termMatches(e, terms) === 0) continue;
    const { score, reasons } = scoreEntry(e, terms, { category });
    if (score < minScore) continue;
    scored.push({ ...e, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  return scored.slice(0, topN);
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
