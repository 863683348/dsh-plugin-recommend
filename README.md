# dsh-plugin-recommend

**Plugin recommender for DeepSeek Harness** — search and rank DSH plugins from a marketplace catalog by need description, category and tags, with match reasons.

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
| | `refresh` | Fetch the latest catalog from the awesome-dsh-plugin README |

## Usage

```
recommend search "browser automation with screenshots"
recommend search "网页浏览" category tools
recommend detail dsh-plugin-gate
recommend categories
recommend refresh
```

Always cross-check a recommendation with the installation safety gate (`gate_scan` from dsh-plugin-gate) before installing.

## Development

```bash
node --check lib/*.js
node test/recommend.test.mjs
node scripts/gen-catalog.mjs   # rebuild lib/catalog.json from awesome data
```

## License

MIT
