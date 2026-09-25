import { expect, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '專案總覽' })).toBeVisible();
}

export async function createProject(page: Page, name: string) {
  await gotoHome(page);
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('new-project-dialog');
  await dialog.getByLabel('專案名稱').fill(name);
  await dialog.getByRole('button', { name: '建立並開始整理需求' }).click();
  await expect(page).toHaveURL(/#\/projects\/[^/]+\/edit\/basics$/);
  await expect(page.locator('#basics-name')).toHaveValue(name);
  return page.url().match(/projects\/([^/]+)\//)![1];
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved');
}

export async function nextStep(page: Page) {
  await page.getByRole('button', { name: /^下一步/ }).click();
}

/** 填完核心需求：目的、使用者、一條流程、兩個功能（一個有驗收條件）。 */
export async function fillCoreRequirements(page: Page, projectId: string) {
  await page.goto(`/#/projects/${projectId}/edit/purpose`);
  await page.locator('#purpose-problem').fill('業務用 Excel 手動複製報價，常算錯總價。');
  await page.locator('#purpose-users').fill('5 位業務');
  await waitSaved(page);

  await page.goto(`/#/projects/${projectId}/edit/flows`);
  await page.getByRole('button', { name: '＋ 新增流程' }).click();
  await page.locator('#flow-FL-001-title').fill('建立報價單');
  await page.locator('#flow-FL-001-start').fill('業務接到詢價');
  await page.locator('#flow-FL-001-steps').fill('選客戶\n加入品項\n按「產生 PDF」');
  await page.locator('#flow-FL-001-expected').fill('下載 PDF，總價正確');
  await waitSaved(page);

  await page.goto(`/#/projects/${projectId}/edit/features`);
  await page.getByRole('button', { name: '＋ 新增功能' }).click();
  await page.locator('#feature-F-001-title').fill('品項輸入與總價計算');
  await page.getByRole('button', { name: '＋ 新增功能' }).click();
  await page.locator('#feature-F-002-title').fill('匯出 PDF');
  await waitSaved(page);

  await page.goto(`/#/projects/${projectId}/edit/acceptance`);
  const f1 = page.locator('#ac-feature-F-001');
  await f1.getByRole('button', { name: '＋ 正常案例' }).click();
  await page.locator('#ac-AC-001-scenario').fill('兩個品項');
  await page.locator('#ac-AC-001-action').fill('輸入數量 2、單價 100');
  await page.locator('#ac-AC-001-expected').fill('總價顯示 400');
  await waitSaved(page);
}

export async function downloadText(download: Download): Promise<string> {
  return readFile((await download.path())!, 'utf8');
}
