import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/#/data',
  '/#/help',
  '/#/projects/demo-tool-lending/summary',
  '/#/projects/demo-tool-lending/edit/basics',
  '/#/projects/demo-tool-lending/edit/acceptance',
  '/#/projects/demo-tool-lending/docs',
  '/#/projects/demo-tool-lending/prompts',
  '/#/projects/demo-tool-lending/briefs',
];

for (const vp of [
  { name: '手機', width: 390, height: 844 },
  { name: '平板', width: 820, height: 1180 },
]) {
  test(`${vp.name}寬度下主要頁面沒有水平溢位與執行錯誤`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const url of PAGES) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} 水平溢位`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}

test('正式 build 設定 CSP，且頁面沒有對外連線', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url());
  });
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
  for (const url of PAGES) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});

test('鍵盤可操作：Tab 能到達主要按鈕並有可見焦點', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '專案總覽' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要內容' })).toBeFocused();
  let found = false;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    if (await page.getByTestId('new-project').evaluate((el) => el === document.activeElement)) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  const outline = await page.getByTestId('new-project').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('new-project-dialog').getByLabel('專案名稱')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('new-project-dialog')).toBeHidden();
});
