import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, id = 'A') {
  await page.goto('/');
  await expect(page.locator('.primary-button')).toBeVisible();
  await page.locator('.template-tab').filter({ has: page.locator('span:first-child', { hasText: new RegExp(`^${id}$`) }) }).click();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  if (id !== 'A') await page.getByRole('button', { name: 'Начать вне очереди' }).click();
  await expect(page.locator('.active-heading h1')).toHaveText(`Тренировка ${id}`);
}
async function fillSet(region: ReturnType<Page['locator']>, index = 1, weight = '12,5', reps = '10') {
  await region.getByRole('textbox', { name: `Вес ${index}`, exact: true }).fill(weight);
  await region.getByRole('textbox', { name: `Повторы ${index}`, exact: true }).fill(reps);
  await region.getByRole('button', { name: `Подтвердить подход ${index}`, exact: true }).click();
}
async function saved(page: Page) { await expect(page.locator('.save-status')).toHaveText('Сохранено на устройстве'); }

test('records, edits, undoes a deletion, adds a set and recovers after navigation and reload', async ({ page }) => {
  await start(page);
  const row = page.getByRole('region', { name: 'Подтягивания', exact: true });
  await expect(row.getByRole('button', { name: 'Подтвердить подход 1', exact: true })).toBeDisabled();
  await fillSet(row, 1, '0', '8');
  await expect(row.getByRole('button', { name: 'Снять отметку 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('1,5');
  await expect(row.getByRole('button', { name: 'Подтвердить подход 1', exact: true })).toBeEnabled();
  await row.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('1.5');
  await expect(row.getByRole('button', { name: 'Подтвердить подход 1', exact: true })).toBeDisabled();
  await row.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('9');
  await row.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await row.getByRole('button', { name: 'Удалить подход 1', exact: true }).click();
  await expect(row.locator('.set-entry')).toHaveCount(3);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(row.locator('.set-entry')).toHaveCount(4);
  await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('1,5');
  await expect(row.getByRole('button', { name: 'Снять отметку 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('textbox', { name: 'Вес 4', exact: true }).fill('5');
  await row.getByRole('button', { name: 'Добавить подход', exact: true }).click();
  await expect(row.getByRole('textbox', { name: 'Вес 5', exact: true })).toHaveValue('5');
  await expect(row.getByRole('textbox', { name: 'Повторы 5', exact: true })).toHaveValue('');
  await row.getByRole('button', { name: /^Заметка/ }).click();
  await row.getByLabel('Заметка', { exact: true }).fill('Проверка сохранения');
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ваша история впереди' })).toBeVisible();
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить тренировку A' }).click();
  await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('1,5');
  await saved(page); await page.reload();
  // First unfinished exercise is expanded automatically, including partially completed work.
  await row.getByRole('button', { name: /^Заметка/ }).click();
  await expect(row.getByLabel('Заметка', { exact: true })).toHaveValue('Проверка сохранения');
  await expect(row.locator('.set-entry')).toHaveCount(5);
});

test('records separate sides, skips/restores, reorders and safely replaces exercises', async ({ page }) => {
  await start(page);
  const row = page.getByRole('region', { name: 'Горизонтальная тяга одной рукой к тазу', exact: true });
  await row.locator('.active-exercise-toggle').click();
  await row.getByLabel('Разные результаты слева и справа').check();
  await row.getByRole('textbox', { name: 'Вес 1 левая', exact: true }).fill('20');
  await row.getByRole('textbox', { name: 'Повторы 1 левая', exact: true }).fill('10');
  await row.getByRole('textbox', { name: 'Вес 1 правая', exact: true }).fill('17,5');
  await row.getByRole('textbox', { name: 'Повторы 1 правая', exact: true }).fill('8');
  await row.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await expect(page.locator('.session-metrics')).toContainText('1 / 22');
  await row.getByRole('button', { name: 'Действия с упражнением' }).click();
  await row.getByRole('button', { name: 'Поднять выше', exact: true }).click();
  await expect(page.locator('.active-exercise').first()).toContainText('Горизонтальная тяга одной рукой к тазу');
  await row.getByRole('button', { name: 'Пропустить упражнение', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(row.locator('.exercise-status')).toHaveText('Пропущено');
  await row.getByRole('button', { name: 'Действия с упражнением' }).click();
  await row.getByRole('button', { name: 'Восстановить упражнение', exact: true }).click();
  await expect(row.getByRole('textbox', { name: 'Вес 1 правая', exact: true })).toHaveValue('17,5');
  await row.getByRole('button', { name: 'Действия с упражнением' }).click();
  await row.getByRole('button', { name: 'Заменить упражнение', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Есть выполненные подходы');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Румынская тяга', exact: true }).click();
  await expect(page.locator('.active-exercise').first().locator('.set-entry')).toHaveCount(4);
  await expect(page.locator('.active-exercise').first().getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('');
  await saved(page);
});

test('adds a library exercise, creates a user exercise and confirms removal of completed work', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  await page.getByLabel('Поиск в библиотеке').fill('Румынская');
  await page.getByRole('button', { name: 'Румынская тяга', exact: true }).click();
  await expect(page.locator('.active-exercise')).toHaveCount(8);
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  await page.getByRole('button', { name: 'Создать своё упражнение' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Моё упражнение с длинным названием для проверки переноса строк');
  await page.getByLabel('Способ учёта веса').selectOption('per-dumbbell');
  await page.getByLabel('Одностороннее упражнение').check();
  await page.getByRole('button', { name: 'Создать и добавить' }).click();
  const added = page.getByRole('region', { name: 'Моё упражнение с длинным названием для проверки переноса строк', exact: true });
  await expect(added).toContainText('Вне программы');
  await fillSet(added);
  await added.getByRole('button', { name: 'Действия с упражнением' }).click();
  await added.getByRole('button', { name: 'Удалить упражнение', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Есть выполненные подходы');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.locator('.active-exercise')).toHaveCount(8);
  await saved(page);
});

test('finishes a full workout, advances cycle and prefills only the same workout next time', async ({ page }) => {
  test.setTimeout(60000);
  await start(page);
  for (const row of await page.locator('.active-exercise').all()) {
    if (await row.locator('.active-exercise-toggle').getAttribute('aria-expanded') !== 'true') await row.locator('.active-exercise-toggle').click();
    const count = await row.locator('.set-entry').count();
    for (let i = 1; i <= count; i++) await fillSet(row, i, '12,5', '10');
  }
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Пропущенных обязательных0');
  await page.getByRole('button', { name: 'Сохранить тренировку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.' })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await page.locator('.history-item').click();
  await expect(page.locator('.history-results')).toContainText('12.5 кг × 10');
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка B', exact: true })).toBeVisible();
  await page.locator('.template-tab').first().click();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Начать вне очереди' }).click();
  const row = page.locator('.active-exercise').first();
  await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('12.5');
  await expect(row.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('10');
  await expect(row.getByRole('button', { name: 'Подтвердить подход 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('can finish incomplete work and cancel another workout without shifting the cycle', async ({ page }) => {
  await start(page, 'B');
  await fillSet(page.locator('.active-exercise').first());
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Сохранить неполную тренировку');
  await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'На главный экран' }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await fillSet(page.locator('.active-exercise').first());
  await page.getByRole('button', { name: 'Отменить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Подтверждённые результаты будут удалены');
  await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
});

test('autosave errors retain edited values and allow an explicit retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, 'failDiaryWrites', { value: false, writable: true });
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions' && (window as unknown as { failDiaryWrites: boolean }).failDiaryWrites) throw new DOMException('Simulated storage failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await start(page);
  await page.evaluate(() => { (window as unknown as { failDiaryWrites: boolean }).failDiaryWrites = true; });
  const row = page.locator('.active-exercise').first();
  await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('25,5');
  await row.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('12');
  await expect(page.locator('.save-status')).toHaveText('Есть несохранённые изменения');
  await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('25,5');
  await page.evaluate(() => { (window as unknown as { failDiaryWrites: boolean }).failDiaryWrites = false; });
  await page.getByRole('button', { name: 'Повторить запись', exact: true }).click();
  await saved(page); await page.reload();
  await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('25,5');
  await expect(row.getByRole('textbox', { name: 'Повторы 1', exact: true })).toHaveValue('12');
});

test('completion errors keep the active workout and a double retry creates one history record', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, 'failFinish', { value: true, writable: true });
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions' && args[0]?.status !== 'active' && (window as unknown as { failFinish: boolean }).failFinish) throw new DOMException('Simulated finish failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await start(page);
  await fillSet(page.locator('.active-exercise').first());
  await saved(page);
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Simulated finish failure');
  await page.getByRole('button', { name: 'Продолжить запись', exact: true }).click();
  await expect(page.locator('.active-exercise').first().getByRole('button', { name: 'Снять отметку 1', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { failFinish: boolean }).failFinish = false; });
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.' })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
});

test('optional exercise can be skipped without making an otherwise full B incomplete', async ({ page }) => {
  await start(page, 'B');
  const optional = page.locator('.active-exercise').last();
  await optional.locator('.active-exercise-toggle').click();
  await expect(optional).toContainText('По желанию');
  await optional.getByRole('button', { name: 'Действия с упражнением' }).click();
  await optional.getByRole('button', { name: 'Пропустить упражнение', exact: true }).click();
  for (let index = 0; index < 6; index++) {
    const row = page.locator('.active-exercise').nth(index);
    await row.locator('.active-exercise-toggle').click();
    for (let set = 1; set <= await row.locator('.set-entry').count(); set++) await fillSet(row, set);
  }
  await expect(page.locator('.session-metrics')).toContainText('19 / 19');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить тренировку', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить тренировку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка сохранена.' })).toBeVisible();
});

test('undo remains available for eight seconds', async ({ page }) => {
  await page.clock.install();
  await start(page);
  await page.locator('.active-exercise').first().getByRole('button', { name: 'Удалить подход 1', exact: true }).click();
  await page.clock.fastForward(7500);
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toHaveCount(0);
});

test('dense recording layout fits 320/375/390px, both themes and a reduced keyboard viewport', async ({ page }) => {
  await start(page);
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 667 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const input = page.getByRole('textbox', { name: 'Вес 1', exact: true });
      expect(await input.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      await input.fill('0');
      await page.setViewportSize({ width, height: 360 });
      await input.focus(); await input.scrollIntoViewIfNeeded();
      await expect(input).toBeInViewport();
      await page.setViewportSize({ width, height: 667 });
    }
  }
});
