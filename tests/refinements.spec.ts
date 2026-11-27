import { expect, test } from '@playwright/test';
test('empty completion has three choices, saves a skip without advancing and cancel creates no history', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Ни один подход не выполнен');
  await page.getByRole('button', { name: 'Продолжить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Отметить как пропущенную' }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1); await expect(page.locator('.history-item')).toContainText('Пропущена');
  await expect(page.locator('.history-item')).not.toContainText('0 рабочих подходов');
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Отменить тренировку без сохранения' }).click();
  await expect(page.getByRole('button', { name: 'Начать тренировку', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click(); await expect(page.locator('.history-item')).toHaveCount(1);
});

test('notes remain collapsed, next exercise is an explicit action and mobile layout stays within viewport', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  const first = page.locator('.active-exercise').first();
  await expect(first.getByLabel('Заметка', { exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: 'Заметка', exact: true }).click();
  await first.getByLabel('Заметка', { exact: true }).fill('Сохранённая заметка');
  await first.getByRole('button', { name: /^Заметка/ }).click();
  for (let i = 1; i <= 4; i++) { await first.getByRole('textbox', { name: `Повторы ${i}`, exact: true }).fill('12'); await first.getByRole('button', { name: `Подтвердить подход ${i}`, exact: true }).click(); }
  await expect(first.locator('.active-exercise-toggle')).toHaveAttribute('aria-expanded', 'true');
  await first.getByRole('button', { name: 'Следующее упражнение', exact: true }).click();
  await expect(page.locator('.active-exercise').nth(1).locator('.active-exercise-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(first.locator('.active-exercise-toggle')).toHaveAttribute('aria-expanded', 'false');
  for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});

test('history edit cancel/save, status correction and safe deletion rollback', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('12'); await page.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click(); await page.getByRole('button', { name: 'Завершить неполную тренировку' }).click();
  await page.getByRole('button', { name: 'История', exact: true }).click(); await page.locator('.history-item').click();
  await expect(page.locator('.history-results')).toContainText('Собственный вес × 12');
  await expect(page.getByText('Пропущенные упражнения (6)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать тренировку' }).click();
  let row = page.locator('.history-edit-exercise').first(); await row.locator('summary').click();
  await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('5'); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.history-results')).toContainText('Собственный вес × 12');
  await page.getByRole('button', { name: 'Редактировать тренировку' }).click();
  row = page.locator('.history-edit-exercise').first(); await expect(row).toHaveAttribute('open', '');
  await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('5');
  await page.getByLabel('Продолжительность, сек.').fill('1497');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.locator('.history-results')).toContainText('+5 кг × 12'); await expect(page.locator('.history-heading')).toContainText('24 мин. 57 сек.');
  await page.getByRole('button', { name: 'Редактировать тренировку' }).click();
  row = page.locator('.history-edit-exercise').first(); await expect(row).toHaveAttribute('open', ''); await row.getByRole('button', { name: 'Удалить подход 1', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click(); await expect(page.getByRole('dialog')).toContainText('Удалён последний подтверждённый подход');
  await page.getByRole('button', { name: 'Сохранить как пропущенную' }).click();
  await expect(page.locator('.history-heading')).toContainText('Пропущена');
  await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
  await page.getByRole('checkbox', { name: /Восстановить цикл/ }).check(); await page.getByRole('button', { name: 'Подтвердить удаление' }).click();
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
});

test('history editor, adding a forgotten set and confirmation dialogs fit both themes and mobile widths', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click(); await page.getByRole('button', { name: 'Отметить как пропущенную' }).click();
  await page.getByRole('button', { name: 'История', exact: true }).click(); await page.locator('.history-item').click();
  await page.getByRole('button', { name: 'Редактировать тренировку' }).click();
  const row = page.locator('.history-edit-exercise').first(); await row.locator('summary').click();
  await row.getByRole('button', { name: 'Добавить подход', exact: true }).click();
  await row.getByRole('textbox', { name: 'Вес 5', exact: true }).fill('10,5'); await row.getByRole('textbox', { name: 'Повторы 5', exact: true }).fill('8');
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 667 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const save = page.getByRole('button', { name: 'Сохранить изменения', exact: true }); await save.scrollIntoViewIfNeeded();
      const box = await save.boundingBox(), nav = await page.locator('.bottom-nav').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    }
  }
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.locator('.history-results')).toContainText('+10.5 кг × 8');
  await expect(page.locator('.history-heading')).toContainText('Неполная');
  await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('не продвигала цикл');
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
