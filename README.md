# dsh-plugin-recommend

**Plugin recommender for DeepSeek Harness** — search and rank DSH plugins from a marketplace catalog by need description, category and tags, with match reasons.

## Compatibility

Tool schemas are validated against the `@deepseek-ai/dsh-tools` value-schema DSL (compiled at plugin load). 1.1.1 fixes a schema violation that made the host abort the whole profile boot on DSH ≥ 0.1.0-rc.6 with `unsupported JSON schema: schema.required is not supported by the value schema DSL`. If you installed an affected version and your DSH no longer starts, upgrade to 1.1.1 (or remove the plugin from the profile) — no data is lost.

## Features

- Embedded catalog: **1135 entries** generated from the awesome-dsh-plugin data (name, repo, category, description, auto-derived tags).
- Free-text scoring: name matches weigh most, then tags, then description; category filter narrows results.
- Live refresh: pulls the latest catalog from the awesome-dsh-plugin README over HTTPS (fallback: embedded catalog).

## Tools

| Tool | Action | What it does |
|---|---|---|
| `recommend` | `search` | Top-N plugins for a need description (`query`), optional `category` / `topN`; each result includes score + match reasons |
| | `categories` | List catalog categories with counts |
| | `detail` | Full catalog entry for one plugin name |
| | `similar` | Nearest alternatives to a plugin (shared tags / category / description overlap) |
| | `refresh` | Fetch the latest catalog from the awesome-dsh-plugin README |

## Usage

```
recommend search "browser automation with screenshots"
recommend search "网页浏览" category tools
recommend detail dsh-plugin-gate
recommend categories
recommend refresh
```

Search results include a `details` breakdown (name +3 / tags +2 / description +1 / category +2), are deduplicated by repository url, and support `diversify` + `perCategory` so one category cannot fill the list.

Always cross-check a recommendation with the installation safety gate (`gate_scan` from dsh-plugin-gate) before installing.

## Development

```bash
node --check lib/*.js
node test/recommend.test.mjs
node scripts/gen-catalog.mjs   # rebuild lib/catalog.json from awesome data
```

## License

MIT


## Roadmap

See [ROADMAP.md](./ROADMAP.md) — next five versions (v1.1.0 – v1.5.0): similar & dedupe, popularity ranking, incremental refresh, requirement clarification, environment presets.
