import { expect, test } from '@playwright/test';
import { seedAudit } from './helpers/audit-data';
test('period and previous trends stay separate and repetitions can be filtered to one load', async ({ page }) => {
  await seedAudit(page); await page.goto('/#/progress/exercise/incline-press');
  await expect(page.locator('.dynamics-summary .trend').first()).toContainText('Рост'); await expect(page.locator('.dynamics-summary .trend').last()).toContainText('Снижение показателя');
  await page.getByLabel('Показатель графика').selectOption('totalReps'); await expect(page.locator('.time-chart > p')).toContainText('Количество повторений');
  await page.getByLabel('Показатель графика').selectOption('sameWeightReps'); await page.getByLabel('Рабочий вес для сравнения').selectOption({ label: '28 кг' }); const count = await page.locator('[data-chart-point]').count(); expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(10); await page.reload(); await expect(page.getByLabel('Показатель графика')).toHaveValue('sameWeightReps'); await expect(page.getByLabel('Рабочий вес для сравнения')).toContainText('28 кг');
});
test('exercise details and recommendations use the current plan and record filters survive reload', async ({ page }) => {
  await seedAudit(page); await page.evaluate(async () => {
    const request = indexedDB.open('log-diary'), database = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); }), tx = database.transaction('templates', 'readwrite'), read = tx.objectStore('templates').get('C');
    read.onsuccess = () => { const template = read.result; template.slots[0].reps = [10, 15]; template.revision++; tx.objectStore('templates').put(template); }; await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); database.close();
  });
  await page.reload(); await page.goto('/#/progress/exercise/incline-press'); await page.getByLabel('Шаблон тренировки').selectOption('C'); await expect(page.locator('[data-recommendation]')).toHaveCount(0); await page.getByLabel('Шаблон тренировки').selectOption('B'); await expect(page.locator('[data-recommendation="increase"]')).toHaveCount(1);
  await page.goto('/#/progress/records'); await page.getByLabel('Упражнение', { exact: true }).selectOption('incline-press'); await page.reload(); await expect(page.getByLabel('Упражнение', { exact: true })).toHaveValue('incline-press'); await expect(page.locator('.record-row').first()).toContainText('Наклонный жим'); await page.locator('.record-row').first().click(); await expect(page).toHaveURL(/#\/history\/audit-/);
});
test('rapid input persists across immediate navigation and normal tab close', async ({ page, context }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click(); await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('13'); await page.getByRole('button', { name: 'История', exact: true }).click(); await page.getByRole('button', { name: 'Тренировка', exact: true }).click(); await page.getByRole('button', { name: 'Продолжить тренировку A', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('13');
  const other = await context.newPage(); await other.goto('/'); await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('14'); await page.close(); await other.goto('/#/workout/active'); await expect(other.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('14');
});
test('exercise search, filters and list scroll survive a detail round trip', async ({ page }) => {
  await seedAudit(page); await page.goto('/#/progress/exercises'); await page.getByLabel('Сортировка упражнений').selectOption('name'); await page.evaluate(() => scrollTo(0, 550)); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
  const row = page.locator('[data-progress-exercise]').nth(6); await row.click(); const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('log:scroll:/progress/exercises') ?? '0')); await page.getByRole('button', { name: 'К упражнениям', exact: true }).click(); await expect(page.getByLabel('Сортировка упражнений')).toHaveValue('name'); await expect.poll(() => page.evaluate(() => scrollY)).toBe(saved);
});
