import { expect, test, type Page } from '@playwright/test';
import { initialExercises, initialProgram, initialTemplates } from '../src/data/seed';
import { withExerciseMetadata } from '../src/data/muscles';
import { createSession } from '../src/domain/session';
const library = initialExercises.map(withExerciseMetadata);
function recorded(id: string, day: number, templateId = 'C', weight = 28, reps = 12) {
  const source = initialTemplates.find(row => row.id === templateId)!;
  const value = createSession(source, initialProgram, library, new Date(`2026-11-${day}T12:00:00+03:00`)); value.id = id; value.status = 'incomplete'; value.endedAt = new Date(`2026-11-${day}T13:00:00+03:00`).toISOString();
  value.exercises[0].sets.forEach(set => Object.assign(set, { weightKg: weight, reps, status: 'completed' })); return value;
}
async function seed(page: Page, single = false) {
  await page.clock.install({ time: new Date('2026-11-27T14:00:00+03:00') }); await page.goto('/#/progress'); await expect(page.getByRole('heading', { name: 'Прогресс', exact: true })).toBeVisible();
  const sessions = single ? [recorded('only-result', 26)] : [recorded('result-b1', 18, 'B', 26, 10), recorded('result-b2', 23, 'B'), recorded('result-c1', 25, 'C', 30), recorded('result-c2', 25, 'C', 30)];
  await page.evaluate(async sessions => {
    const request = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(['sessions', 'bodyWeights'], 'readwrite'); sessions.forEach(row => tx.objectStore('sessions').put(row));
    tx.objectStore('bodyWeights').put({ id: 'weight-1', measuredAt: '2026-11-18T08:00:00+03:00', weightKg: 70, revision: 0 }); tx.objectStore('bodyWeights').put({ id: 'weight-2', measuredAt: '2026-11-26T08:00:00+03:00', weightKg: 71, revision: 0 });
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close();
  }, sessions); await page.reload(); await expect(page.locator('.dashboard-stats')).toBeVisible();
}
test('empty analytics has no fake results and every progress route reloads safely', async ({ page }) => {
  await page.goto('/#/progress'); await expect(page.getByText('Измерений пока нет', { exact: true })).toBeVisible(); await expect(page.locator('.dashboard-stats button').first()).toContainText('0'); await expect(page.locator('.dashboard-stats')).toContainText('—');
  for (const path of ['exercises', 'body', 'volume', 'records', 'statistics', 'recommendations']) { await page.goto(`/#/progress/${path}`); await page.reload(); await expect(page.getByRole('button', { name: 'Прогресс', exact: true })).toHaveAttribute('aria-current', 'page'); await expect(page.locator('main h1')).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.goto('/#/progress/exercise/missing'); await expect(page).toHaveURL(/#\/progress\/exercises$/); await page.goto('/#/progress/body/missing'); await expect(page).toHaveURL(/#\/progress\/body$/);
});
test('periods, exercise search, template/metric filters and point details survive reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await seed(page);
  await page.getByLabel('Период', { exact: true }).selectOption('all'); await page.reload(); await expect(page.getByLabel('Период', { exact: true })).toHaveValue('all');
  await page.getByRole('button', { name: /Упражнения Веса, повторы/ }).click(); await page.getByLabel('Поиск результатов').fill('Наклонный'); await page.getByLabel('Мышечная группа', { exact: true }).selectOption('Грудь'); await page.getByLabel('Сортировка упражнений').selectOption('name'); await page.reload(); await expect(page.getByLabel('Поиск результатов')).toHaveValue('Наклонный'); await expect(page.locator('[data-progress-exercise]')).toHaveCount(1);
  await page.locator('[data-progress-exercise]').click(); await expect(page).toHaveURL(/#\/progress\/exercise\/incline-press$/); await page.getByLabel('Шаблон тренировки').selectOption('B'); await page.getByLabel('Показатель графика').selectOption('weight'); await page.reload();
  await expect(page.getByLabel('Шаблон тренировки')).toHaveValue('B'); await expect(page.getByLabel('Показатель графика')).toHaveValue('weight'); await expect(page.locator('.analytics-stats').first()).toContainText('2'); await expect(page.locator('[data-chart-point]')).toHaveCount(2);
  await page.locator('[data-chart-point="result-b1"]').click(); await expect(page.locator('.chart-value')).toContainText('26 кг'); await expect(page.locator('.point-source:visible').filter({ hasText: '26 кг × 10' }).first()).toContainText('26 кг × 10');
  await page.locator('.point-source:visible').filter({ hasText: '26 кг × 10' }).first().getByRole('button', { name: 'Открыть тренировку в истории' }).click(); await expect(page).toHaveURL(/#\/history\/result-b1$/); await page.goBack(); await expect(page).toHaveURL(/#\/progress\/exercise\/incline-press$/); await expect(page.getByLabel('Шаблон тренировки')).toHaveValue('B'); expect(new URL(page.url()).hash).not.toContain('26'); expect(errors).toEqual([]);
});
test('body weight supports draft recovery, decimal input, editing, deletion and actual smoothing', async ({ page }) => {
  await seed(page); await page.goto('/#/progress/body'); await expect(page.locator('.measurement-row')).toHaveCount(2); await expect(page.locator('.time-chart')).toContainText('Измерения и среднее за 7 дней');
  await page.getByRole('button', { name: 'Добавить измерение', exact: true }).click(); await page.getByLabel('Дата и время измерения').fill('2026-11-27T10:00:00'); await page.getByLabel('Собственный вес, кг').fill('71,65'); page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('Собственный вес, кг')).toHaveValue('71,65');
  await page.getByRole('button', { name: 'Сохранить измерение', exact: true }).click(); await expect(page).toHaveURL(/#\/progress\/body$/); await expect(page.locator('.measurement-row')).toHaveCount(3);
  const row = page.locator('.measurement-row').first(); await row.locator('.measurement-main').click(); await page.getByLabel('Собственный вес, кг').fill('72,1'); await page.getByRole('button', { name: 'Сохранить измерение', exact: true }).click(); await expect(row).toContainText('72,1 кг');
  await row.locator('.row-menu > button').click(); await page.getByRole('button', { name: 'Удалить', exact: true }).click(); await page.getByRole('button', { name: 'Удалить измерение', exact: true }).click(); await expect(page.locator('.measurement-row')).toHaveCount(2); await expect(page.locator('.analytics-stats')).toContainText('71 кг');
});
test('progress recommendations also appear in the active exercise and can be switched off', async ({ page }) => {
  await seed(page); await page.goto('/#/progress/recommendations'); await expect(page.locator('[data-recommendation="increase"]').first()).toBeVisible();
  await page.goto('/#/workout'); await page.getByRole('button', { name: 'C Тренировка', exact: true }).click(); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click(); await page.getByRole('button', { name: 'Начать вне очереди', exact: true }).click(); await expect(page.locator('.active-exercise').first().locator('[data-recommendation="increase"]')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click(); await page.getByRole('checkbox', { name: 'Показывать рекомендации по прогрессии', exact: true }).uncheck(); await expect(page.getByRole('checkbox', { name: 'Показывать рекомендации по прогрессии', exact: true })).toBeEnabled(); await page.reload(); await expect(page.getByRole('checkbox', { name: 'Показывать рекомендации по прогрессии', exact: true })).not.toBeChecked(); await page.goto('/#/workout/active'); await expect(page.locator('.active-exercise').first()).toBeVisible(); await expect(page.locator('[data-recommendation]')).toHaveCount(0);
});
test('history deletion immediately removes dependent analytics and a saved route redirects', async ({ page }) => {
  await seed(page, true); await page.goto('/#/progress/exercise/incline-press'); await expect(page.locator('.point-source').first()).toContainText('28 кг'); await expect(page.locator('[data-chart-point]')).toHaveCount(1); await page.locator('.point-source').first().getByRole('button', { name: 'Открыть тренировку в истории' }).click();
  await page.getByRole('button', { name: 'Редактировать тренировку', exact: true }).click(); const row = page.locator('.history-edit-exercise').first(); await row.locator('summary').click(); await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('32'); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page).toHaveURL(/#\/history\/only-result$/); await page.goto('/#/progress/exercise/incline-press'); await expect(page.locator('.point-source').first()).toContainText('32 кг');
  await page.locator('.point-source').first().getByRole('button', { name: 'Открыть тренировку в истории' }).click(); await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click(); await expect(page).toHaveURL(/#\/history$/); await page.goto('/#/progress/exercise/incline-press'); await expect(page).toHaveURL(/#\/progress\/exercises$/); await expect(page.locator('[data-progress-exercise]')).toHaveCount(0);
});
test('archived exercises remain available and a single point displays all supported metrics', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const request = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); }); const tx = db.transaction(['sessions', 'exercises'], 'readwrite'); const read = tx.objectStore('sessions').get('only-result');
    read.onsuccess = () => { const session = read.result; session.id = 'archived-result'; for (const rows of [session.exercises, session.originalExercises]) { rows[0].exercise.id = 'archived-only'; rows[0].exercise.name = 'Архивный жим'; rows[0].exercise.archived = true; } tx.objectStore('exercises').put(session.exercises[0].exercise); tx.objectStore('sessions').put(session); }; await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.goto('/#/progress/exercises'); await page.reload(); await page.getByLabel('Поиск результатов').fill('Архивный'); await expect(page.locator('[data-progress-exercise]')).toContainText('Архив'); await page.locator('[data-progress-exercise]').click();
  for (const metric of ['strength', 'weight', 'reps', 'sets', 'tonnage']) { await page.getByLabel('Показатель графика').selectOption(metric); await expect(page.locator('[data-chart-point]')).toHaveCount(1); }
  await page.getByLabel('Точка графика', { exact: true }).selectOption('archived-result'); await expect(page.locator('.chart-value')).toContainText('2'); await expect(page.locator('.chart-value')).toContainText('016');
});
test('statistics separate sessions from attendance days and records link to real history', async ({ page }) => {
  await seed(page); await page.goto('/#/progress/statistics'); await expect(page.locator('.statistics-list > div').filter({ hasText: 'Тренировок с результатами' })).toContainText('4'); await expect(page.locator('.statistics-list > div').filter({ hasText: 'Дней посещения' })).toContainText('3');
  await page.goto('/#/progress/records'); await expect(page.locator('.record-row').first()).toBeVisible(); await page.locator('.record-row').first().click(); await expect(page).toHaveURL(/#\/history\/result-/); await expect(page.locator('.history-heading')).toBeVisible();
});
test('all populated analytics screens and charts fit both themes at 320/375/390px', async ({ page }) => {
  await seed(page);
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); for (const path of ['', '/exercises', '/exercise/incline-press', '/body', '/volume', '/records', '/statistics']) {
      await page.goto('/#/progress' + path); await expect(page.locator('main h1')).toBeVisible(); const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })).slice(0, 12) })); expect(overflow.scrollWidth, JSON.stringify({ path, theme, ...overflow })).toBeLessThanOrEqual(width); expect(await page.locator('input:not([type="checkbox"]),select,textarea').evaluateAll(elements => elements.every(element => parseFloat(getComputedStyle(element).fontSize) >= 16))).toBe(true);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); const nav = await page.locator('.bottom-nav').boundingBox(); const last = await page.locator('main').evaluate(element => element.getBoundingClientRect().bottom - parseFloat(getComputedStyle(element).paddingBottom)); expect(last).toBeLessThanOrEqual(nav!.y + 1);
    } }
  }
});
