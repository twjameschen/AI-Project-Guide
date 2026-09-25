import { expect, test, type Page } from '@playwright/test';
import { createProject, downloadText, fillCoreRequirements, gotoHome } from './helpers';

function brief(projectId: string, recordId: string, extra: Record<string, unknown> = {}) {
  return {
    format: 'ai-project-guide/brief',
    formatVersion: 1,
    projectId,
    recordId,
    taskIds: ['T-F-001'],
    tool: 'claude_code',
    model: null,
    occurredAt: '2026-03-01T18:00:00+08:00',
    branch: 'feature/total',
    commit: null,
    summary: `完成總價計算（${recordId}）`,
    changedFiles: ['src/total.py'],
    tests: [{ command: 'pytest -q', environment: 'Python 3.12', result: 'passed', evidence: '4 passed' }],
    knownIssues: [],
    unfinished: ['PDF 匯出尚未開始'],
    decisionsNeeded: [],
    nextSteps: [`下一步來自 ${recordId}`],
    ...extra,
  };
}

async function importBrief(page: Page, json: string) {
  await page.getByRole('button', { name: '匯入 brief JSON' }).click();
  await page.getByLabel('或貼上 JSON').fill(json);
  await page.getByRole('button', { name: '檢查並預覽' }).click();
}

test('5+6. 匯入 brief 顯示回報狀態、版本與下一步；接手 Prompt 使用選定的 brief', async ({ page }) => {
  const id = await createProject(page, '報價單產生器');
  await fillCoreRequirements(page, id);
  await page.goto(`/#/projects/${id}/briefs`);
  await expect(page.getByTestId('no-briefs')).toBeVisible();

  // 錯誤專案被拒絕
  await importBrief(page, JSON.stringify(brief('other-project', 'r-x')));
  await expect(page.getByTestId('import-errors')).toContainText('此 brief 屬於其他專案');
  // 錯誤版本被拒絕
  await page.getByLabel('或貼上 JSON').fill(JSON.stringify(brief(id, 'r-x', { formatVersion: 9 })));
  await page.getByRole('button', { name: '檢查並預覽' }).click();
  await expect(page.getByTestId('import-errors')).toContainText('不支援的 brief 版本');
  // 錯誤 JSON 被拒絕
  await page.getByLabel('或貼上 JSON').fill('{ not json');
  await page.getByRole('button', { name: '檢查並預覽' }).click();
  await expect(page.getByTestId('import-errors')).toContainText('不是有效的 JSON');

  // 正確匯入：先預覽再確認
  await page.getByLabel('或貼上 JSON').fill(JSON.stringify(brief(id, 'rec-001')));
  await page.getByRole('button', { name: '檢查並預覽' }).click();
  await expect(page.getByTestId('import-preview')).toContainText('尚未綁定版本');
  await expect(page.getByTestId('brief-item')).toHaveCount(0);
  await page.getByRole('button', { name: '確認匯入' }).click();
  const item = page.locator('[data-record-id="rec-001"]');
  await expect(item).toContainText('匯入回報（JSON）');
  await expect(item).toContainText('尚未綁定版本');
  await expect(item).toContainText('接手依據');
  await expect(item).toContainText('下一步（回報）：下一步來自 rec-001');
  await expect(item).toContainText('當時回報，不代表目前版本');

  // 重複匯入同一紀錄 ID 不會新增
  await importBrief(page, JSON.stringify(brief(id, 'rec-001')));
  await expect(page.getByTestId('import-duplicate')).toBeVisible();
  await expect(page.getByTestId('brief-item')).toHaveCount(1);
  await page.getByTestId('brief-import').getByRole('button', { name: '取消' }).click();

  // 第二筆（有 commit），不設為接手依據
  await importBrief(page, JSON.stringify(brief(id, 'rec-002', { commit: 'a1b2c3d4e5', occurredAt: '2026-03-02T10:00:00+08:00' })));
  await page.getByLabel(/設為接手依據/).uncheck();
  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.getByTestId('brief-item')).toHaveCount(2);
  await expect(page.locator('[data-record-id="rec-002"]')).toContainText('commit a1b2c3d4e5');

  // 總覽顯示最新 brief 與下一步
  await gotoHome(page);
  const card = page.getByTestId('project-card').filter({ hasText: '報價單產生器' });
  await expect(card.getByTestId('dev-status')).toContainText('最新 brief');
  await expect(card).toContainText('下一步來自 rec-002');

  // 接手 Prompt 預設使用「接手依據」rec-001
  await page.goto(`/#/projects/${id}/prompts`);
  await page.getByLabel('情境').selectOption('continue');
  const out = page.getByTestId('prompt-output');
  await expect(out).toHaveValue(/依使用者選定的執行 brief（rec-001）/);
  await expect(out).toHaveValue(/尚未綁定版本（沒有 commit）/);
  // 改選 rec-002
  const briefSelect = page.getByLabel('依據的執行 brief');
  const rec2 = await briefSelect.locator('option', { hasText: 'rec-002' }).getAttribute('value');
  await briefSelect.selectOption(rec2!);
  await expect(out).toHaveValue(/依使用者選定的執行 brief（rec-002）/);
  await expect(out).toHaveValue(/commit a1b2c3d4e5/);
  await expect(out).not.toHaveValue(/rec-001/);
  // 不使用 brief：要求先盤點
  await briefSelect.selectOption('__none__');
  await expect(out).toHaveValue(/不可假設任何已完成的進度/);

  // 將 rec-002 設為接手依據後，handoff.md 使用它
  await page.goto(`/#/projects/${id}/briefs`);
  await page.locator('[data-record-id="rec-002"]').getByRole('button', { name: '設為接手依據' }).click();
  await page.goto(`/#/projects/${id}/docs`);
  await page.getByRole('button', { name: 'docs/handoff.md' }).click();
  await expect(page.getByTestId('doc-preview')).toContainText('紀錄 ID：rec-002');
});

test('7. 全部備份匯出後，在乾淨狀態匯入，資料一致', async ({ page, browser }) => {
  const id = await createProject(page, '備份測試專案');
  await fillCoreRequirements(page, id);
  await page.goto(`/#/projects/${id}/briefs`);
  await importBrief(page, JSON.stringify(brief(id, 'rec-backup')));
  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.getByTestId('brief-item')).toHaveCount(1);

  await page.goto('/#/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
  const original = JSON.parse(await downloadText(dl));
  expect(original.projects).toHaveLength(2); // 示範專案 + 新專案
  const backupPath = (await dl.path())!;

  // 乾淨的瀏覽器狀態（新的 context = 空的 IndexedDB）
  const ctx = await browser.newContext();
  const clean = await ctx.newPage();
  await clean.goto('/');
  await expect(clean.getByTestId('project-card')).toHaveCount(1); // 只有自動加入的示範專案
  await clean.getByRole('button', { name: '移除示範專案' }).click();
  await clean.getByTestId('confirm-dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(clean.getByText('還沒有專案')).toBeVisible();

  await clean.goto('/#/data');
  await clean.locator('#backup-file').setInputFiles(backupPath);
  await expect(clean.getByTestId('backup-row')).toHaveCount(2);
  await clean.getByTestId('apply-import').click();
  await expect(clean.getByTestId('toast-success').filter({ hasText: '匯入完成' })).toContainText('新增 2');

  const [dl2] = await Promise.all([clean.waitForEvent('download'), clean.getByTestId('export-all').click()]);
  const restored = JSON.parse(await downloadText(dl2));
  expect(restored.projects).toEqual(original.projects);

  // 衝突處理：再次匯入同一份備份，選擇「另存新專案」
  await clean.locator('#backup-file').setInputFiles(backupPath);
  const row = clean.getByTestId('backup-row').filter({ hasText: '備份測試專案' });
  await expect(row).toContainText('ID 衝突');
  await row.getByLabel(/另存新專案/).check();
  await clean.getByTestId('apply-import').click();
  await expect(clean.getByTestId('toast-success').filter({ hasText: '另存 1' })).toBeVisible();
  await clean.goto('/');
  await expect(clean.getByTestId('project-card').filter({ hasText: '備份測試專案（匯入副本）' })).toHaveCount(1);
  await ctx.close();
});

test('複製 API 不可用時提供手動複製', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
  });
  await page.goto('/#/projects/demo-tool-lending/prompts');
  await page.getByTestId('copy-prompt').click();
  await expect(page.getByTestId('toast-error')).toContainText('無法自動複製');
  const manual = page.getByTestId('manual-copy');
  await expect(manual).toBeVisible();
  await expect(manual.locator('textarea')).toHaveValue(/新專案啟動/);
});

test('複製成功時顯示提示', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/projects/demo-tool-lending/prompts');
  await page.getByTestId('copy-prompt').click();
  await expect(page.getByTestId('toast-success')).toContainText('已複製');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('# 新專案啟動');
});

test('手動填寫 brief：必填驗證、來源標示為手動、測試結果與未綁定版本', async ({ page }) => {
  await page.goto('/#/projects/demo-tool-lending/briefs');
  await page.getByRole('button', { name: '手動填寫紀錄' }).click();
  const form = page.getByTestId('brief-manual');
  await form.getByRole('button', { name: '保存紀錄' }).click();
  await expect(form.getByRole('alert')).toContainText('summary');

  await form.getByLabel('紀錄 ID').fill('manual-test-01');
  await form.getByLabel('完成摘要').fill('手動記錄：歸還功能完成一半');
  await form.getByRole('button', { name: '＋ 新增測試' }).click();
  await form.getByLabel('命令').fill('npm test');
  await form.getByLabel('結果').selectOption('failed');
  await form.getByLabel('證據（文字或 https 連結）').fill('2 failed');
  await form.getByLabel(/建議下一步/).fill('修正歸還日期計算');
  await form.getByRole('button', { name: '保存紀錄' }).click();

  const item = page.locator('[data-record-id="manual-test-01"]');
  await expect(item).toContainText('手動填寫');
  await expect(item).toContainText('尚未綁定版本');
  await expect(item).toContainText('失敗 1');
  await expect(item).toContainText('接手依據');
  await item.getByText('展開證據與細節').click();
  await expect(item).toContainText('2 failed');
});
