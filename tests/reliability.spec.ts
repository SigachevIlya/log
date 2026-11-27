import { expect, test } from '@playwright/test';

test('recovers synchronous journal when a tab closes before a held transaction commits', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'sessions' && args[0]?.exercises?.[0]?.sets?.[0]?.reps === 14) {
        const store = this;
        const keepAlive = () => { try { const read = store.get(args[0].id); read.onsuccess = keepAlive; } catch { /* page closing */ } };
        keepAlive();
      }
      return request;
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('13');
  await expect(page.locator('.save-status')).toHaveText('Сохранено на устройстве');
  await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('14');
  await expect(page.locator('.save-status')).toHaveText('Сохранение…');
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('log:session-journal:')))).toBe(true);
  // pagehide is the lifecycle release. Closing kills the deliberately held transaction.
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.close();
  const other = await context.newPage(); await other.goto('/#/workout/active');
  await expect(other.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('14');
  await expect(other.locator('.save-status')).toHaveText('Сохранено на устройстве');
  await other.reload(); await expect(other.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('14');
});

test('summary survives reload and back forward while a missing summary redirects', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.', exact: true })).toBeVisible();
  const summary = page.url(); await page.reload();
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'На главный экран', exact: true }).click();
  await page.goBack(); await expect(page).toHaveURL(summary);
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.', exact: true })).toBeVisible();
  await page.goForward(); await expect(page).toHaveURL(/#\/workout$/);
  await page.goto('/#/workout/summary/missing'); await expect(page).toHaveURL(/#\/workout$/);
});
