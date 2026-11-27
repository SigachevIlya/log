import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.get('/__test__/reset'); });
for (const prefix of ['', '/log', '/configured']) test('unvisited sections and graphs open on first offline navigation at ' + (prefix || '/'), async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const modules: string[] = []; page.on('request', request => { if (/assets\/.*\.js$/.test(request.url())) modules.push(request.url()); });
  await page.goto(prefix + '/#/settings/application');
  await expect(page.locator('.application-status')).toContainText('Готово к автономной работе', { timeout: 25000 });
  // Readiness now includes actual JS evaluation, not just bytes in CacheStorage.
  expect(modules.some(url => url.includes('ProgressPage'))).toBe(true);
  expect(modules.some(url => url.includes('DataPage'))).toBe(true);
  expect(modules.some(url => url.includes('GuidePage'))).toBe(true);
  await context.setOffline(true);
  // No offline reload before the very first visit: this is the reported iPhone path.
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.locator('.dashboard-stats')).toBeVisible();
  for (const route of ['progress/exercises', 'progress/volume', 'progress/records', 'progress/recommendations', 'progress/statistics', 'progress/body', 'history', 'program', 'program/library', 'settings/data', 'settings/guide']) {
    await page.goto(prefix + '/#/' + route); await expect(page.locator('main h1')).toBeVisible();
  }
  // Enter a real measurement offline so the chart renders, not just its empty state.
  await page.goto(prefix + '/#/progress/body/new');
  await page.getByLabel('Собственный вес, кг').fill('72,5'); await page.getByRole('button', { name: 'Сохранить измерение', exact: true }).click();
  await expect(page.locator('.measurement-row')).toHaveCount(1); await expect(page.locator('.chart-canvas')).toBeVisible();
  await page.reload(); await expect(page.locator('.measurement-row')).toHaveCount(1);
  await page.goto(prefix + '/#/progress'); await expect(page.locator('.chart-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('failed module import prevents offline readiness and offers recovery instead of an endless spinner', async ({ page, request }) => {
  // Valid SHA-256 but failing evaluation: this deterministically separates byte-cache from runtime readiness.
  await request.get('/__test__/module-failure');
  await page.goto('/#/settings/application');
  await expect(page.locator('.application-status')).toContainText('Не удалось', { timeout: 25000 });
  await expect(page.locator('.application-status')).not.toContainText('Готово к автономной работе');
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Повторить загрузку раздела', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить загрузку раздела', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Перезагрузить вкладку', exact: true })).toBeVisible();
  await request.get('/__test__/reset'); await page.goto('/#/settings/application');
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect(page.locator('.update-banner')).toBeVisible({ timeout: 25000 });
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting)).toBe(true);
  await page.locator('.update-banner').getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.locator('.application-status')).toContainText('Готово к автономной работе', { timeout: 25000 });
  await page.goto('/#/progress'); await expect(page.locator('.dashboard-stats')).toBeVisible();
});

test('updates the original 0.5.2 source to the current release without losing workout or measurement data', async ({ page, context, request }) => {
  await request.get('/__test__/version/previous');
  await page.goto('/log/#/settings/application');
  await expect(page.getByRole('heading', { name: 'LOG. 0.5.2', exact: true })).toBeVisible();
  await expect(page.locator('.application-status')).toContainText('Готово к автономной работе', { timeout: 25000 });
  await page.goto('/log/#/workout'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.', exact: true })).toBeVisible();
  await page.goto('/log/#/progress/body/new'); await page.getByLabel('Собственный вес, кг').fill('72,5');
  await page.getByRole('button', { name: 'Сохранить измерение', exact: true }).click(); await expect(page.locator('.measurement-row')).toHaveCount(1);
  const read = () => page.evaluate(async () => {
    const request = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const names = ['sessions', 'program', 'settings', 'bodyWeights', 'templates', 'exercises', 'metadata'];
    const tx = db.transaction(names, 'readonly'), rows = names.map(name => tx.objectStore(name).getAll());
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close(); return rows.map(row => row.result);
  });
  const before = await read(); await request.get('/__test__/reset');
  await page.goto('/log/#/settings/application'); await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect(page.locator('.update-banner')).toBeVisible({ timeout: 25000 });
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting)).toBe(true);
  await page.locator('.update-banner').getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LOG. 0.5.3', exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.application-status')).toContainText('Готово к автономной работе'); expect(await read()).toEqual(before);
  await context.setOffline(true); await page.goto('/log/#/progress/body'); await page.reload();
  await expect(page.locator('.measurement-row')).toHaveCount(1); await expect(page.locator('.chart-canvas')).toBeVisible(); expect(await read()).toEqual(before);
});
