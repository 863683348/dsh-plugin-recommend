import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  categoryCounts,
  loadEmbeddedCatalog,
  parseAwesomeReadme,
  rank,
  repoKey,
  similar,
  similarity,
  dedupe,
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


test("similarity weights shared tags, category and description overlap", () => {
  const a = { n: "a", c: "memory", d: "durable notes for agents", t: ["memory", "notes"] };
  const b = { n: "b", c: "memory", d: "durable notes across sessions", t: ["memory", "notes"] };
  const c = { n: "c", c: "fun", d: "a game", t: ["game"] };
  const sim = similarity(a, b);
  assert.ok(sim.score > 0);
  assert.deepEqual(sim.sharedTags.sort(), ["memory", "notes"]);
  assert.equal(sim.sameCategory, true);
  assert.ok(sim.reasons.some((r) => r.includes("shared tags")));
  assert.equal(similarity(a, c).score, 0, "unrelated entries score zero");
});

test("similar returns nearest alternatives and excludes the target", () => {
  const entries = [
    { n: "target", c: "memory", d: "durable notes for agents", t: ["memory", "notes"] },
    { n: "close", c: "memory", d: "durable notes for sessions", t: ["memory"] },
    { n: "far", c: "fun", d: "a game", t: ["game"] },
  ];
  const res = similar(entries, "target", { topN: 5 });
  assert.equal(res.target.n, "target");
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].n, "close");
  assert.ok(res.results[0].score > 0);
  assert.ok(Array.isArray(res.results[0].reasons));
  assert.equal(similar(entries, "nope").target, null);
  assert.throws(() => similar(entries, ""), /name is required/);
});

test("rank diversifies across categories", () => {
  const entries = [
    { n: "m1", c: "memory", d: "memory tool", t: ["memory"] },
    { n: "m2", c: "memory", d: "memory tool", t: ["memory"] },
    { n: "m3", c: "memory", d: "memory tool", t: ["memory"] },
    { n: "f1", c: "fun", d: "memory game", t: ["memory"] },
  ];
  const flat = rank(entries, ["memory"], { topN: 4, diversify: false });
  const diverse = rank(entries, ["memory"], { topN: 4, diversify: true, perCategory: 1 });
  assert.equal(flat.length, 4);
  const cats = diverse.map((e) => e.c);
  assert.equal(cats.length, new Set(cats).size, "one entry per category with perCategory=1");
  assert.ok(diverse.length < flat.length);
});

test("rank can dedupe entries by repo url and reports details", () => {
  const entries = [
    { n: "one", c: "tools", u: "https://github.com/o/repo", d: "tool thing", t: ["tool"] },
    { n: "one-again", c: "tools", u: "https://github.com/o/repo/", d: "tool thing", t: ["tool"] },
    { n: "two", c: "tools", u: "https://github.com/o/other", d: "tool thing", t: ["tool"] },
  ];
  const deduped = rank(entries, ["tool"], { topN: 5, dedupeByRepo: true });
  assert.equal(deduped.length, 2, "same repo collapsed");
  assert.ok(deduped.every((r) => Array.isArray(r.details) && r.details.length > 0));
  assert.ok(deduped[0].details.some((d) => d.field === "tags" && d.term === "tool" && d.weight === 2), "tag hit recorded with weight 2");
  const withDupes = rank(entries, ["tool"], { topN: 5, dedupeByRepo: false });
  assert.equal(withDupes.length, 3);
});

test("repoKey and dedupe normalise urls", () => {
  assert.equal(repoKey({ u: "https://github.com/a/b/" }), "https://github.com/a/b");
  assert.equal(repoKey({ n: "NoUrl" }), "nourl");
  const out = dedupe([{ n: "a", u: "https://x/1" }, { n: "b", u: "https://x/1" }, { n: "c", u: "https://x/2" }]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.n), ["a", "c"]);
});

test("rank keeps the default behaviour without new options", () => {
  const entries = [
    { n: "alpha", c: "tools", u: "https://x/a", d: "alpha tool", t: ["alpha"] },
    { n: "beta", c: "tools", u: "https://x/b", d: "beta helper", t: ["beta"] },
  ];
  const res = rank(entries, ["alpha"], { topN: 5 });
  assert.equal(res.length, 1);
  assert.equal(res[0].n, "alpha");
  assert.ok(res[0].score >= 5, "name (3) + tag (2) at minimum");
});
