# dsh-plugin-recommend 路线图（Roadmap）

> 基线：**v1.0.0**（已发布 npm / 已挂 vertical-toolkits profile）
> 范围：接下来 5 个版本 **v1.1.0 → v1.5.0**
> 规划原则：检索与排序保持纯函数可单测；目录刷新离线降级；每个 minor 交付 1–2 个可独立验证的能力。

## 版本总览

| 版本 | 主题 | 关键交付 |
|---|---|---|
| v1.1.0 | 相似与去重 | `similar` 相似插件推荐 + 结果去重与多样性 + 打分明细 |
| v1.2.0 | 热度排序 | 结合 npm 周下载与 star 的热度权重与排序模式 |
| v1.3.0 | 增量刷新 | 目录刷新带 ETag/时间戳缓存，离线降级 |
| v1.4.0 | 需求澄清 | 需求模糊时反问候选分类/关键词 |
| v1.5.0 | 环境预设 | 组合推荐与环境预设（与 need-finder 配方互通） |

## v1.1.0 ✅ 已完成 — 相似与去重

### 新增能力
- **`similar` 动作**：给定一个插件名，按同标签/同分类/描述相似度推荐相近插件（含相似理由），便于找替代或同族工具。
- **去重与多样性**：`search` 结果按仓库名去重（同仓库多条目合并），并支持 `diversify` 限制同分类条数；每条结果附 `reasons`（命中字段与权重）。

### 实现位置
- `lib/recommend.js`：新增 `similarity` / `diversify` / 明细打分纯函数
- `lib/index.js`：注册 `similar` 动作；`search` 增加 `diversify` / `perCategory`

### 验收标准
- [ ] `node --check` 通过；新增单测 ≥ 8 个（相似度排序、去重、多样性、明细、边界）
- [ ] 原有 `recommend.test.mjs` 全绿
- [ ] README 更新（新动作与参数）
- [ ] vertical-toolkits dump-config 正常

## v1.2.0 — 热度排序

- 目录条目补充 npm 周下载与 star（可离线为空）
- `search` 增加 `sort=relevance|popular|recent`

## v1.3.0 — 增量刷新

- 刷新带 ETag/If-Modified-Since 与本地缓存（`ctx.fs` 工作区文件），命中缓存跳过下载

## v1.4.0 — 需求澄清

- 需求过短/过泛时返回候选分类与建议关键词，而不是硬塞结果

## v1.5.0 — 环境预设

- 组合推荐（多插件成套）与环境预设导出，与 need-finder 配方格式互通

## 发布节奏

每个版本走完整 dsh-factory 流程：本地验证 → npm publish → GitHub topic → awesome PR。
