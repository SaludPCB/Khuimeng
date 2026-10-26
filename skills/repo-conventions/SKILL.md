---
name: repo-conventions
description: 範例 skill——示範全角色通用的倉庫慣例怎麼寫（可自行修改或刪除）
---

# 倉庫慣例（範例）

- 本倉庫為 ESM TypeScript（`"type": "module"`），引入一律帶副檔名
- 提交訊息格式：`type: 簡述`（feat / fix / docs / test / chore）
- `reports/` 與 `.khuimeng/` 不進版控；`legacy/` 是封存舊引擎，勿修改
- 變更後以 `npm run typecheck` 與 `npm test` 自證（148+ 案須全綠）
