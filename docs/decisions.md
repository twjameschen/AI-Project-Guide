# 架構與技術決策

每項記錄：決定、理由、影響。依實際結果更新。

## D-001 純前端 + IndexedDB

- 決定：React + TypeScript + Vite 單頁應用，資料存 IndexedDB（`idb` 包裝），HashRouter。
- 理由：規格要求第一版不需後端；HashRouter 讓 `dist/` 可放任何靜態位置。
- 影響：資料不跨裝置；需提供 JSON 備份；多分頁同時編輯同一專案時以最後寫入為準（未處理合併）。

## D-002 版本選擇（2026-09-25）

npm 上最新為 Vite 8、TypeScript 7、Vitest 5、ESLint 10、React Router 8。依「不為最新增加風險」選擇：

| 套件 | 版本 | 理由 |
| --- | --- | --- |
| react / react-dom | ^19.2.8（lock 解析 19.3.0） | 穩定主版本 |
| typescript | ~5.9.3 | typescript-eslint 8.70 peer 需 `<6.1.0` |
| vite / @vitejs/plugin-react | ^7.3.6 / ^5.2.0 | plugin-react 6 需 Vite 8 |
| vitest | ^5.0.2 | 原選 4.1.11 時 npm 10.9.7 解析 optional peer（`@vitejs/devtools-vitest → vitest@*`）發生 arborist `edgesOut` 崩潰；5.0.2 支援 Vite 7 且可正常安裝 |
| react-router | ^7.18.4 | v8 為新主版本 |
| eslint | ^9.39.5 | 搭配 typescript-eslint 8、react-hooks 7 flat config |
| @playwright/test | 1.56.1（固定） | 對應環境已安裝的 Chromium 1194 |
| zod 4、idb 8、fflate 0.8、react-markdown 10 + remark-gfm 4 | — | 驗證、IndexedDB、ZIP、安全 Markdown 預覽 |

## D-003 生成邏輯與 UI 分離

- 決定：`src/generators/`（docs、prompts、workflows、zip、md）皆為純函式；匯出時間由呼叫端傳入。
- 理由：可單元測試、同輸入同輸出（含 ZIP 位元組，mtime 固定為匯出時間）。

## D-004 三態欄位與標記

- 決定：可延後的欄位以 `{ text, mode: 'answer' | 'undecided' | 'ai_propose' }` 表示；文件以【使用者確認】【待決定】【模板建議】標記。
- 理由：避免把未決內容寫成決策。

## D-005 revision 規則

- 決定：只有「內容」變更才遞增 revision；wizardStep、archived、summaryConfirmedRevision 不算（`src/domain/revision.ts`）。接手依據（handoffBriefId）算內容，因為影響 handoff.md。
- 影響：匯出過期判斷以 revision + handoffBriefId 比對。

## D-006 Skills 格式與位置（依官方文件確認）

- Claude Code：`.claude/skills/<name>/SKILL.md`，frontmatter `name`、`description`；可 `/name` 呼叫。來源：code.claude.com/docs/en/skills（2026-09-25 直接讀取）。
- Claude Code 讀 AGENTS.md：官方建議 CLAUDE.md 以 `@AGENTS.md` 匯入共用內容（code.claude.com/docs/en/memory，直接讀取）。Claude Code 不讀 `.agents/` 目錄。
- Codex：repo skills 放 `.agents/skills`，從目前目錄往上掃到 repo 根目錄。來源：developers.openai.com/codex/skills（**此環境的網路 proxy 封鎖該網域，只能透過搜尋結果摘錄確認，未直接讀取全文**）。
- 共同格式：Agent Skills 規格（name 小寫英數與連字號、需與資料夾同名、≤64 字；description 必填、≤1024 字）。來源：agentskills 規格原始檔。
- 決定：流程內容只放 `docs/workflows/<name>.md`，SKILL.md 為精簡入口；文件明確說明未在實際工具驗證自動載入。

## D-007 安全

- 正式 build 注入 CSP（`connect-src 'self'`、`script-src 'self'`、`object-src 'none'`、`form-action 'none'`）；dev 模式不注入（需 HMR inline preamble）。
- Markdown 預覽：`skipHtml`、連結僅 http(s)/mailto、不載入圖片。
- 使用者文字寫入 Markdown 時：`<!` → `<\!`、`<tag` → `\<tag`、行首 `#` 跳脫，使用者輸入無法產生完整合併標記或原始 HTML。
- ZIP 路徑只接受程式產生的安全相對路徑，固定根資料夾 `ai-guide-export/`。
- 匯入：brief 256 KB、備份 20 MB 上限；zod 驗證；未來 schemaVersion 拒絕；備份內部關聯檢查。

## D-008 匯出放置方式

- 決定：ZIP 內所有檔案在 `ai-guide-export/` 下；AGENTS.md／CLAUDE.md 內容以 `<!-- ai-project-guide:start/end -->` 包住，供附加或替換。
- 理由：避免直接解壓覆蓋目標專案既有規則。

## D-009 已知取捨

- bundle 約 706 kB（gzip 224 kB），Vite 會提示大小警告；本機工具可接受，未做 code splitting。
- 未支援舊版 schema 遷移（目前只有 v1）；`parseBackupText` 對 `< 1` 版本直接拒絕。
