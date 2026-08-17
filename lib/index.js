/**
 * dsh-plugin-recommend — plugin recommender for DeepSeek Harness.
 *
 * A Cordis plugin. Registers the recommend model tool plus prompt guidance.
 * Searches an embedded marketplace catalog (lib/catalog.json, generated from
 * the awesome-dsh-plugin data at build time) by need description, category
 * and tags, ranks matches with reasons, and can refresh the catalog live
 * from the public awesome-dsh-plugin README over HTTPS.
 *
 * @module dsh-plugin-recommend
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  CATEGORIES,
  categoryCounts,
  loadEmbeddedCatalog,
  parseAwesomeReadme,
  rank,
  tokenize,
} from "./recommend.js";

/** Cordis plugin name. */
const name = "recommend";

/** Services this plugin must resolve before it applies (host face). */
const inject = ["tools", "systemPrompt"];

/** Composition-row configuration. */
const Config = z.object({
  /** Default number of results to return. */
  topN: z.number().default(5),
  /** Minimum score for a result to be returned. */
  minScore: z.number().default(1),
  /** Register the prompt-guidance section. */
  promptSection: z.boolean().default(true),
  /** Order of the prompt section. */
  sectionOrder: z.number().default(7),
});

/** Prompt guidance for the agent. */
const RECOMMEND_SECTION_TEXT = "Plugin discovery: before installing or building a plugin, use the recommend tool to find existing DSH plugins for a need.\n\n- recommend search \"<need description>\" — keyword/tag/category matching over the marketplace catalog, with top-N results and match reasons.\n- recommend categories — list catalog categories with counts.\n- recommend detail <plugin name> — full catalog entry for one plugin.\n- recommend refresh — fetch the latest catalog from the awesome-dsh-plugin README (fallback: embedded catalog).\n\nAlways cross-check a recommendation with the installation safety gate (gate_scan) before installing.";

/** Catalog cache: embedded catalog + optional live refresh. */
let liveCatalog = null;

function currentCatalog() {
  return liveCatalog || loadEmbeddedCatalog();
}

function findByName(entries, query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length === 0) return null;
  return entries.find((e) => e.n.toLowerCase() === q)
    || entries.find((e) => e.n.toLowerCase().includes(q))
    || null;
}

/**
 * Register the recommend tool and (when configured) the prompt section.
 * @param ctx - registrant context.
 * @param config - validated plugin configuration.
 */
function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: "recommend",
    description: "Plugin recommender: find DSH plugins for a need from the marketplace catalog. Actions: search (default) with a free-text query plus optional category and topN; categories (list categories with counts); detail <name> (full catalog entry); refresh (fetch the latest catalog from the awesome-dsh-plugin README). Examples: recommend search \"browser automation with screenshots\"; recommend search \"网页浏览\" category tools; recommend detail dsh-plugin-gate; recommend categories.",
    parameters: {
      query: {
        type: "string",
        description: "Free-text need description (required for search; used by detail as a name).",
      },
      action: {
        type: "string",
        enum: ["search", "categories", "detail", "refresh"],
        description: "What to do (default search).",
      },
      category: {
        type: "string",
        enum: CATEGORIES,
        description: "Optional category filter for search.",
      },
      topN: {
        type: "integer",
        description: "Number of results (default from config).",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          action: { type: "string", required: true },
          ok: { type: "boolean", required: true },
          detail: { type: "string", required: true },
          source: { type: "string" },
          catalogSize: { type: "integer" },
          query: { type: "string" },
          category: { type: "string" },
          total: { type: "integer" },
          categories: { type: "object" },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                url: { type: "string" },
                category: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                score: { type: "number" },
                reasons: { type: "array", items: { type: "string" } },
                description: { type: "string" },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ["[recommend:" + value.action + "] " + value.detail + " (catalog " + value.catalogSize + ", source " + value.source + ")"];
        for (const r of (value.results || [])) {
          lines.push("  #" + r.score + " " + r.name + " [" + r.category + "] " + r.url);
          if (r.reasons && r.reasons.length) lines.push("      " + r.reasons.join("; "));
          if (r.description) lines.push("      " + String(r.description).slice(0, 120));
        }
        if (value.categories) lines.push("categories: " + JSON.stringify(value.categories));
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (args) => {
      const action = String(args.action || "search");
      const query = String(args.query || "").trim();
      const entries = currentCatalog();
      const source = liveCatalog ? "live" : "embedded";

      if (action === "categories") {
        return { action: "categories", ok: true, detail: "catalog categories", source, catalogSize: entries.length, categories: categoryCounts(entries) };
      }

      if (action === "detail") {
        const hit = findByName(entries, query);
        if (!hit) return { action: "detail", ok: false, detail: "no plugin named " + (query || "(empty)") + " in catalog", source, catalogSize: entries.length };
        return {
          action: "detail",
          ok: true,
          detail: hit.n,
          source,
          catalogSize: entries.length,
          results: [{
            name: hit.n,
            url: hit.u,
            category: hit.c,
            tags: hit.t || [],
            score: 1,
            reasons: ["exact/partial name match"],
            description: hit.d,
          }],
        };
      }

      if (action === "refresh") {
        try {
          const res = await fetch("https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md", {
            headers: { "User-Agent": "dsh-plugin-recommend" },
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) throw new Error("http " + res.status);
          const md = await res.text();
          const parsed = parseAwesomeReadme(md);
          if (parsed.length === 0) throw new Error("no entries parsed");
          liveCatalog = parsed;
          return { action: "refresh", ok: true, detail: "catalog refreshed from awesome-dsh-plugin README", source: "live", catalogSize: parsed.length };
        } catch (e) {
          return { action: "refresh", ok: false, detail: "refresh failed: " + (e && e.message || e) + " — using embedded catalog", source, catalogSize: entries.length };
        }
      }

      // search (default)
      if (query.length === 0) {
        return { action: "search", ok: false, detail: "search needs a query describing the need", source, catalogSize: entries.length };
      }
      const terms = tokenize(query);
      const topN = typeof args.topN === "number" && args.topN > 0 ? args.topN : config.topN;
      const results = rank(entries, terms, { category: args.category, topN, minScore: config.minScore }).map((r) => ({
        name: r.n,
        url: r.u,
        category: r.c,
        tags: r.t,
        score: Math.round(r.score * 100) / 100,
        reasons: r.reasons,
        description: r.d,
      }));
      return {
        action: "search",
        ok: true,
        detail: "top " + results.length + " of catalog for '" + query + "'" + (args.category ? " in " + args.category : ""),
        source,
        catalogSize: entries.length,
        query,
        category: args.category,
        total: results.length,
        results,
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Recommend: " + (args.action || "search") + (args.query ? " " + String(args.query).slice(0, 40) : ""),
      kind: "other",
      rawInput: args,
    }),
  }));

  if (config.promptSection) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: "recommend:instructions",
      order: config.sectionOrder,
      text: RECOMMEND_SECTION_TEXT,
    }), "recommend.section()");
  }
}

export { Config, RECOMMEND_SECTION_TEXT, apply, inject, name };
