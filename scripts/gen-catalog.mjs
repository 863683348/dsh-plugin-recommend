/**
 * Rebuild lib/catalog.json from a local checkout of the awesome-dsh-plugin
 * data directory. Usage:
 *   node scripts/gen-catalog.mjs [path-to-awesome-dsh-plugin/data/plugins]
 *   (defaults to ../../awesome-dsh-plugin/data/plugins relative to this repo)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.argv[2] || path.join(repoRoot, "..", "awesome-dsh-plugin", "data", "plugins"));
const outFile = path.join(repoRoot, "lib", "catalog.json");

const TAG_LEXICON = [
  ["browser", ["browser", "playwright", "chrome", "edge", "cdp", "网页", "浏览"]],
  ["search", ["search", "搜索", "tavily", "bing", "duckduckgo"]],
  ["memory", ["memory", "记忆", "vault", "recall"]],
  ["notify", ["notif", "通知", "alert", "toast"]],
  ["voice", ["voice", "speech", "语音", "whisper", "tts", "朗读"]],
  ["mcp", ["mcp", "model context protocol"]],
  ["security", ["secur", "安全", "gate", "guard", "scan", "audit", "redactor"]],
  ["git", ["github", "提交", "branch"]],
  ["markdown", ["markdown", "readme"]],
  ["image", ["image", "img", "图片", "vision", "screenshot", "截图", "视觉"]],
  ["video", ["video", "视频"]],
  ["workflow", ["workflow", "工作流", "automation", "自动化", "n8n"]],
  ["skill", ["skill", "技能", "instruction"]],
  ["session", ["session", "会话", "archiv", "history", "历史"]],
  ["model", ["model", "llm", "模型", "ollama", "token"]],
  ["terminal", ["terminal", "终端", "pty", "shell", "bash"]],
  ["theme", ["theme", "皮肤", "skin", "样式"]],
  ["ui", ["panel", "面板", "sidebar", "侧边", "toolbar"]],
  ["data", ["data", "数据", "scrap", "爬"]],
  ["api", ["api key", "接口", "rest api"]],
  ["file", ["文件", "workspace", "工作区"]],
  ["productivity", ["timer", "pomodoro", "番茄", "focus", "专注"]],
];

function tagsFor(name, desc) {
  const hay = (name + " " + desc).toLowerCase();
  const tags = [];
  for (const [tag, keys] of TAG_LEXICON) {
    if (keys.some((k) => hay.includes(k))) tags.push(tag);
  }
  return tags.slice(0, 6);
}

const URL_RE = /^url:[ \t]*(.+)$/m;
const NAME_RE = /^name:[ \t]*(.+)$/m;
const CAT_RE = /^category:[ \t]*(.+)$/m;
const EN_RE = /^[ \t]+en:[ \t]*'?(.*?)'?[ \t]*$/m;
const ZH_RE = /^[ \t]+zh:[ \t]*'?(.*?)'?[ \t]*$/m;

function parseEntry(text) {
  const u = (text.match(URL_RE) || [])[1];
  const n = (text.match(NAME_RE) || [])[1];
  const category = (text.match(CAT_RE) || [])[1];
  if (!u || !n || !category) return null;
  const en = (text.match(EN_RE) || [])[1];
  const zh = (text.match(ZH_RE) || [])[1];
  const d = (en || zh || "").trim();
  return { n: n.trim(), u: u.trim(), c: category.trim(), d: d.slice(0, 140), t: tagsFor(n, d) };
}

const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".yml"));
const entries = [];
for (const f of files) {
  try {
    const e = parseEntry(fs.readFileSync(path.join(dataDir, f), "utf8"));
    if (e) entries.push(e);
  } catch { /* skip malformed entries */ }
}
entries.sort((a, b) => a.n.localeCompare(b.n));
const json = JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, json);
console.log("catalog rebuilt:", entries.length, "entries ->", outFile);
