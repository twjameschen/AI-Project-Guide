import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { createProject, fillCoreRequirements, gotoHome, nextStep, waitSaved } from './helpers';

test('1. 新增專案、填部分資料，重新整理後恢復草稿', async ({ page }) => {
  const id = await createProject(page, '報價單產生器');
  await page.locator('#basics-summary').fill('業務輸入品項後產生 PDF 報價單。');
  await page.getByLabel('既有專案').check();
  await waitSaved(page);
  await nextStep(page);
  await expect(page).toHaveURL(/edit\/purpose$/);
  await page.locator('#purpose-problem').fill('常算錯總價');
  // 三態欄位：標記為尚未決定
  await page.getByRole('radiogroup', { name: /希望改善成什麼樣子/ }).getByLabel('尚未決定').check();
  await waitSaved(page);

  await page.reload();
  // 回到專案時從上次的步驟繼續
  await page.goto(`/#/projects/${id}/edit`);
  await expect(page).toHaveURL(/edit\/purpose$/);
  await expect(page.locator('#purpose-problem')).toHaveValue('常算錯總價');
  await expect(page.getByRole('radiogroup', { name: /希望改善成什麼樣子/ }).getByLabel('尚未決定')).toBeChecked();
  await page.getByRole('link', { name: /基本資訊/ }).click();
  await expect(page.locator('#basics-summary')).toHaveValue('業務輸入品項後產生 PDF 報價單。');
  await expect(page.getByLabel('既有專案')).toBeChecked();
});

test('2. 補齊核心需求後查看缺漏與摘要，並可返回對應欄位', async ({ page }) => {
  const id = await createProject(page, '報價單產生器');
  await page.goto(`/#/projects/${id}/summary`);
  await expect(page.getByTestId('spec-status')).toHaveText('草稿');
  await expect(page.getByTestId('issues-missing')).toContainText('缺少產品目的');
  await expect(page.getByTestId('issues-missing')).toContainText('缺少核心流程');

  // 從缺漏返回對應欄位
  await page.getByTestId('issues-missing').locator('li', { hasText: '缺少產品目的' }).getByRole('link', { name: '前往填寫' }).click();
  await expect(page).toHaveURL(/edit\/purpose\?focus=purpose-problem/);
  await expect(page.locator('#purpose-problem')).toBeFocused();

  await fillCoreRequirements(page, id);
  await page.goto(`/#/projects/${id}/summary`);
  // F-002 仍沒有驗收條件
  await expect(page.getByTestId('required-count')).toHaveText('5/6');
  await expect(page.getByTestId('issues-missing')).toContainText('核心功能 F-002 沒有驗收條件');
  await expect(page.getByTestId('issues-missing')).not.toContainText('缺少產品目的');
  await expect(page.getByTestId('project-summary')).toContainText('品項輸入與總價計算');
  await expect(page.getByText('這不是 AI 審查')).toBeVisible();

  await page.getByRole('button', { name: '確認摘要' }).click();
  await expect(page.getByText(/已確認此 revision（\d+）的摘要/)).toBeVisible();
});

test('3+4. 下載 ZIP 檢查內容；編輯需求後文件與 Prompt 更新並提示舊匯出過期', async ({ page }) => {
  const id = await createProject(page, 'Quote Tool');
  await fillCoreRequirements(page, id);

  await page.goto(`/#/projects/${id}/docs`);
  await expect(page.getByTestId('export-status')).toContainText('尚未下載過文件包');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
  expect(download.suggestedFilename()).toMatch(/^ai-guide-quote-tool-r\d+\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const names = Object.keys(files).sort();
  for (const f of [
    'START_HERE.md', 'AGENTS.md', 'CLAUDE.md', 'docs/product.md', 'docs/acceptance.md', 'docs/architecture.md',
    'docs/tasks.md', 'docs/decisions.md', 'docs/ai-workflow.md', 'docs/handoff.md', 'ai-guide-export.json',
    '.claude/skills/project-takeover/SKILL.md', '.agents/skills/review-changes/SKILL.md', 'docs/workflows/verify-and-complete.md',
  ]) {
    expect(names).toContain(`ai-guide-export/${f}`);
  }
  expect(names.every((n) => n.startsWith('ai-guide-export/') && !n.includes('..'))).toBe(true);
  const product = strFromU8(files['ai-guide-export/docs/product.md']);
  expect(product).toContain('**F-001** 品項輸入與總價計算');
  expect(product).toContain('【使用者確認】業務用 Excel 手動複製報價，常算錯總價。');
  const manifest = JSON.parse(strFromU8(files['ai-guide-export/ai-guide-export.json']));
  expect(manifest.snapshot).toBe(true);
  expect(manifest.projectId).toBe(id);
  const exportedRevision: number = manifest.revision;
  await expect(page.getByTestId('export-status')).toContainText('與目前資料一致');

  // 編輯需求
  await page.goto(`/#/projects/${id}/edit/features`);
  await page.locator('#feature-F-002-title').fill('匯出 Excel');
  await waitSaved(page);

  await page.goto(`/#/projects/${id}/docs`);
  await expect(page.getByTestId('export-stale')).toContainText(`最近一次下載是 revision ${exportedRevision}`);
  await page.getByRole('button', { name: 'docs/product.md' }).click();
  await expect(page.getByTestId('doc-preview')).toContainText('匯出 Excel');
  await expect(page.getByTestId('doc-preview')).not.toContainText('匯出 PDF');

  await page.goto(`/#/projects/${id}/prompts`);
  await page.getByLabel('情境').selectOption('implement');
  await page.getByRole('checkbox', { name: /F-002/ }).check();
  const prompt = page.getByTestId('prompt-output');
  await expect(prompt).toHaveValue(/實作以下功能：F-002 匯出 Excel/);
  await expect(prompt).toHaveValue(/專案內文件可能不是最新/);
});

test('8. 刪除取消不失去資料，確認後才刪除', async ({ page }) => {
  await createProject(page, '要刪除的專案');
  await gotoHome(page);
  const card = page.getByTestId('project-card').filter({ hasText: '要刪除的專案' });
  await card.getByRole('button', { name: '刪除' }).click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('專案需求資料');
  await expect(dialog).toContainText('0 筆執行紀錄（brief）');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('project-card').filter({ hasText: '要刪除的專案' })).toHaveCount(1);

  await page.getByTestId('project-card').filter({ hasText: '要刪除的專案' }).getByRole('button', { name: '刪除' }).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByTestId('project-card').filter({ hasText: '要刪除的專案' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('project-card').filter({ hasText: '要刪除的專案' })).toHaveCount(0);
});
