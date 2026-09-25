# AI Project Guide — 開發入口

純前端 React + TypeScript + Vite，資料存 IndexedDB。無後端、無 AI API、無對外連線。

## 先讀

1. `docs/product.md`：產品範圍與規則
2. `docs/decisions.md`：架構決策與版本選擇
3. `docs/tasks.md`：任務狀態與驗證紀錄
4. `docs/handoff.md`：目前狀態與修改注意事項

## 驗證命令

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e   # Playwright，自動 build + preview（port 4173）
```

## 規則

- 小步修改；每次修改後執行相關測試並回報實際結果。未執行的驗證標記「未驗證」。
- 不得以跳過測試、削弱斷言或吞錯讓檢查通過；認為測試有誤需先說明依據。
- 生成邏輯放 `src/generators/`（純函式，時間由呼叫端傳入），不要放進 UI。
- 模板內容變更需遞增 `TEMPLATE_VERSION`；資料格式變更需遞增 `SCHEMA_VERSION` 並提供遷移。
- 不新增對外連線、分析追蹤或模型 API。
- 完成工作後更新 `docs/tasks.md` 與 `docs/handoff.md`。
