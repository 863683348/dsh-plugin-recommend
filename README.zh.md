# dsh-plugin-recommend（插件推荐器）

为 DeepSeek Harness 按需求描述、分类和标签搜索并排序 DSH 插件，返回匹配理由。

## 特性

- 内嵌目录：由 awesome-dsh-plugin 数据生成的 **1135 条**条目（名称、仓库、分类、描述、自动标签）。
- 自由文本评分：名称命中权重最高，其次标签、描述；支持分类过滤。
- 在线刷新：从 awesome-dsh-plugin README 拉取最新目录（失败回退内嵌目录）。

## 工具

| 动作 | 作用 |
|---|---|
| `search` | 按需求描述返回 Top-N（`query`），可选 `category` / `topN`；每条含得分与匹配理由 |
| `categories` | 分类及条目数 |
| `detail` | 单个插件的完整目录条目 |
| `refresh` | 从 awesome README 拉取最新目录 |

## 使用

```
recommend search "browser automation with screenshots"
recommend search "网页浏览" category tools
recommend detail dsh-plugin-gate
recommend categories
recommend refresh
```

安装前请务必再用安装安全闸门（dsh-plugin-gate 的 gate_scan）交叉核验推荐结果。

## 开发

```bash
node --check lib/*.js
node test/recommend.test.mjs
node scripts/gen-catalog.mjs
```

## 许可证

MIT
