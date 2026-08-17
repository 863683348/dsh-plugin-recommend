import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  categoryCounts,
  loadEmbeddedCatalog,
  parseAwesomeReadme,
  rank,
  scoreEntry,
  tokenize,
} from "../lib/recommend.js";

const SAMPLE = [
  { n: "dsh-plugin-gate", u: "https://github.com/863683348/dsh-plugin-gate", c: "tools", d: "installation safety gate scanning install scripts and network callbacks", t: ["security", "scan", "network"] },
  { n: "dsh-browser-control", u: "https://github.com/kyo615/dsh-browser-control", c: "tools", d: "playwright browser control with screenshots", t: ["browser", "playwright"] },
  { n: "dsh-plugin-focus", u: "https://github.com/863683348/dsh-plugin-focus", c: "memory", d: "durable focus board in the workspace", t: ["memory", "context"] },
  { n: "dsh-voice", u: "https://github.com/x/dsh-voice", c: "tools", d: "voice input", t: ["voice"] },
];

test("tokenize produces CJK bigrams and english terms, drops stopwords", () => {
  const terms = tokenize("找一个浏览器自动化的插件 with screenshot");
  assert.ok(terms.includes("浏览"), "bigram 浏览: " + terms.join(","));
  assert.ok(terms.includes("览器"));
  assert.ok(terms.includes("浏览器") || terms.includes("器自"), "has browser bigrams: " + terms.join(","));
  assert.ok(terms.includes("screenshot"));
  assert.ok(!terms.includes("with"));
  assert.ok(!terms.includes("plugin"));
});

test("scoreEntry weights name above tag above description, adds category bonus", () => {
  const nameHit = scoreEntry(SAMPLE[0], ["gate"]).score;
  const tagHit = scoreEntry(SAMPLE[0], ["security"]).score;
  const descHit = scoreEntry(SAMPLE[0], ["callback"]).score;
  assert.ok(nameHit > tagHit && tagHit > descHit, nameHit + " " + tagHit + " " + descHit);
  const withCat = scoreEntry(SAMPLE[0], ["scan"], { category: "tools" }).score;
  const noCat = scoreEntry(SAMPLE[0], ["scan"]).score;
  assert.ok(withCat > noCat);
  assert.ok(scoreEntry(SAMPLE[0], ["scan"]).reasons.length > 0);
});

test("rank orders by score, applies category filter, topN and minScore", () => {
  const top = rank(SAMPLE, tokenize("browser"), { topN: 1 });
  assert.equal(top.length, 1);
  assert.equal(top[0].n, "dsh-browser-control");
  const filtered = rank(SAMPLE, tokenize("browser"), { category: "memory" });
  assert.equal(filtered.length, 0);
  const min = rank(SAMPLE, tokenize("zzzz"), { minScore: 5 });
  assert.equal(min.length, 0);
});

test("categoryCounts counts per category", () => {
  const c = categoryCounts(SAMPLE);
  assert.equal(c.tools, 3);
  assert.equal(c.memory, 1);
});

test("parseAwesomeReadme extracts entries under en category headings", () => {
  const md = [
    "# awesome-dsh-plugin",
    "",
    "### Tools",
    "",
    "- [dsh-browser](https://github.com/a/dsh-browser) - drive a browser",
    "- [dsh-search](https://github.com/b/dsh-search) — search the web",
    "",
    "### Memory",
    "",
    "- [dsh-vault](https://github.com/c/dsh-vault) - cross-session memory",
    "",
  ].join("\n");
  const entries = parseAwesomeReadme(md);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].c, "tools");
  assert.equal(entries[0].n, "dsh-browser");
  assert.equal(entries[2].c, "memory");
  assert.ok(entries[1].d.includes("search"));
});

test("CATEGORIES contains the canonical ids", () => {
  assert.ok(CATEGORIES.includes("tools"));
  assert.ok(CATEGORIES.includes("memory"));
  assert.ok(CATEGORIES.includes("dev"));
});

test("embedded catalog loads and is large enough to be useful", () => {
  const entries = loadEmbeddedCatalog();
  assert.ok(entries.length >= 1000, "catalog has " + entries.length + " entries");
  assert.ok(entries.some((e) => e.n === "863683348/dsh-plugin-focus"), "focus entry present");
  const withTags = entries.filter((e) => Array.isArray(e.t) && e.t.length > 0);
  assert.ok(withTags.length > 500, "tagged entries: " + withTags.length);
});
