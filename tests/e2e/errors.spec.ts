import { expect, test } from '@playwright/test';
import { createProject, waitSaved } from './helpers';

test('保存失敗時顯示錯誤而非成功，提供重試與下載，恢復後可保存', async ({ page }) => {
  await createProject(page, '保存失敗測試');
  // 模擬瀏覽器儲存空間不足
  await page.evaluate(() => {
    const w = window as unknown as { __origPut: typeof IDBObjectStore.prototype.put };
    w.__origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.locator('#basics-summary').fill('這段文字無法保存');
  const status = page.getByTestId('save-status');
  await expect(status).toContainText('保存失敗');
  await expect(status).toContainText('瀏覽器儲存空間不足');
  await expect(status).not.toContainText('已保存');
  await expect(status.getByRole('button', { name: '下載目前內容（JSON）' })).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), status.getByRole('button', { name: '下載目前內容（JSON）' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^ai-guide-unsaved-.*\.json$/);

  await page.evaluate(() => {
    const w = window as unknown as { __origPut: typeof IDBObjectStore.prototype.put };
    IDBObjectStore.prototype.put = w.__origPut;
  });
  await status.getByRole('button', { name: '重試保存' }).click();
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('#basics-summary')).toHaveValue('這段文字無法保存');
});

test('IndexedDB 不可用時顯示說明，不假裝可以保存', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '無法使用瀏覽器儲存空間' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('無法使用 IndexedDB');
  await expect(page.getByTestId('new-project')).toHaveCount(0);
});

test('示範專案寫入失敗時不阻擋啟動', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.add = function () {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '專案總覽' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '還沒有專案' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '無法使用瀏覽器儲存空間' })).toHaveCount(0);
});
