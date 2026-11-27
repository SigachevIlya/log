import { expect, test } from '@playwright/test';
async function program(page: import('@playwright/test').Page) { await page.goto('/'); await page.getByRole('button', { name: 'Программа тренировок', exact: true }).click(); await expect(page.locator('.program-heading h1')).toBeVisible(); }

test('creates a fourth template, edits its positions and runs an arbitrary ordered cycle', async ({ page }) => {
  await program(page); await page.getByRole('button', { name: 'Добавить тренировку', exact: true }).click();
  await page.getByLabel('Название тренировки', { exact: true }).fill('Новая тренировка'); await page.getByLabel('Обозначение', { exact: true }).fill('D'); await page.getByLabel('Мышечные группы (через запятую)').fill('Грудь, Ноги');
  await page.getByRole('button', { name: 'Добавить упражнение в шаблон' }).click(); await page.getByRole('button', { name: 'Жим штанги лёжа', exact: true }).click();
  const slot = page.locator('.template-slot').first(); await slot.locator('summary').click();
  await slot.getByLabel('Подходы', { exact: true }).fill('2'); await slot.getByLabel('Повторы от', { exact: true }).fill('6'); await slot.getByLabel('Повторы до', { exact: true }).fill('10');
  await slot.getByLabel('Пояснение только для этой тренировки').fill('Локальное пояснение');
  await slot.getByLabel('Чередовать варианты', { exact: true }).check();
  await slot.getByRole('button', { name: 'Добавить вариант чередования' }).click(); await page.getByRole('button', { name: 'Присед со штангой', exact: true }).click();
  await slot.getByLabel('Следующий вариант', { exact: true }).selectOption({ label: 'Присед со штангой' });
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
  await expect(page.locator('.program-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Изменить цикл', exact: true }).click();
  await page.getByLabel('Название программы', { exact: true }).fill('Мой цикл');
  for (let i = 0; i < 3; i++) await page.locator('.cycle-editor').locator('.variant-row').filter({ hasText: 'Новая тренировка' }).getByRole('button', { name: 'Выше', exact: true }).click();
  await page.getByLabel('Следующая тренировка', { exact: true }).selectOption({ label: 'Новая тренировка' }); await page.getByRole('button', { name: 'Сохранить цикл', exact: true }).click();
  await expect(page.locator('.program-sequence')).toHaveText('D → A → B → C');
  await page.getByRole('button', { name: 'К тренировке', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Новая тренировка', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Выбрать тренировку' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page.locator('.active-exercise').first()).toContainText('Присед со штангой');
  await page.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('40'); await page.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('8'); await page.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click(); await page.getByRole('button', { name: 'Завершить неполную тренировку', exact: true }).click(); await page.getByRole('button', { name: 'На главный экран', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
});

test('warns on unsaved template exit, keeps active snapshots and locks cycle changes', async ({ page }) => {
  await program(page); await page.getByRole('button', { name: 'Редактировать A', exact: true }).click();
  await page.getByText('Основная информация', { exact: true }).click();
  await page.getByLabel('Название тренировки', { exact: true }).fill('Несохранённый черновик');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'История', exact: true }).click(); await expect(page.getByLabel('Название тренировки', { exact: true })).toHaveValue('Несохранённый черновик');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(page.locator('.program-heading h1')).toBeVisible();
  await page.getByRole('button', { name: 'К тренировке', exact: true }).click(); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click(); await page.getByRole('button', { name: 'Редактор программы и библиотека', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Изменить цикл', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Редактировать A', exact: true }).click(); await page.getByLabel('Название тренировки', { exact: true }).fill('Будущая A');
  const slot = page.locator('.template-slot').first(); await slot.locator('summary').click(); await slot.getByLabel('Подходы', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click(); await page.getByRole('button', { name: 'К тренировке', exact: true }).click(); await page.getByRole('button', { name: 'Продолжить тренировку A', exact: true }).click();
  await expect(page.locator('.active-heading h1')).toHaveText('Тренировка A'); await expect(page.locator('.active-exercise').first().locator('.set-entry')).toHaveCount(4);
});

test('library supports muscle filters, creation, technical variants and archives', async ({ page }) => {
  await program(page); await page.getByRole('button', { name: 'Библиотека упражнений', exact: true }).click();
  await page.getByLabel('Мышечная группа', { exact: true }).selectOption('Грудь'); await expect(page.locator('.program-card').first()).toContainText('Грудь');
  await page.getByRole('button', { name: 'Создать упражнение', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Моё упражнение с достаточно длинным названием для мобильной библиотеки'); await page.getByLabel('Основная мышечная группа').selectOption('Пресс'); await page.getByLabel('Способ учёта веса').selectOption('bodyweight'); await page.getByRole('button', { name: 'Создать и добавить' }).click();
  await page.getByLabel('Мышечная группа', { exact: true }).selectOption(''); await page.getByLabel('Поиск упражнений').fill('Моё упражнение');
  const card = page.locator('.program-card').first(); await card.getByRole('button', { name: 'Изменить', exact: true }).click(); await page.getByLabel('Пояснение по технике').fill('Новая техника'); await page.getByRole('button', { name: 'Сохранить упражнение' }).click(); await expect(page.getByRole('dialog')).toContainText('Рекомендуется отдельный вариант'); await page.getByRole('button', { name: 'Сохранить вариант', exact: true }).click();
  await expect(page.locator('.program-card')).toHaveCount(2);
  const id = await card.getAttribute('data-exercise-id');
  await card.locator('.row-menu > button').click(); await card.getByRole('button', { name: 'Архивировать', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await page.locator('.archive-list > summary').click();
  const archived = page.locator(`[data-exercise-id="${id}"]`); await archived.locator('.row-menu > button').click(); await archived.getByRole('button', { name: 'Восстановить', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.locator('.archive-list')).toHaveCount(0);
});

test('edits regular days, moves one visit, rejects occupied dates, adds and undoes a one-off day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-27T10:00:00+03:00') }); await page.goto('/');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click(); await page.getByRole('button', { name: 'Изменить тренировочные дни' }).click();
  await page.getByRole('checkbox', { name: 'Понедельник', exact: true }).check(); await page.getByRole('button', { name: 'Сохранить дни', exact: true }).click();
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click();
  await page.getByRole('button', { name: /^2026-11-29,/ }).click(); await page.getByLabel('Перенести на дату').fill('2026-12-01'); await page.getByRole('button', { name: 'Перенести тренировочный день' }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('уже есть');
  await page.getByLabel('Перенести на дату').fill('2026-11-28'); await page.getByRole('button', { name: 'Перенести тренировочный день' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^2026-11-28,/ }).click(); await expect(page.getByRole('dialog')).toContainText('Перенос: 2026-11-29'); await page.getByRole('button', { name: 'Отменить изменение даты' }).click();
  await page.getByRole('button', { name: /^2026-11-28,/ }).click(); await page.getByRole('button', { name: 'Добавить тренировочный день', exact: true }).click();
  await expect(page.getByRole('button', { name: /^2026-11-28, Дополнительный день/ })).toBeVisible();
  await page.getByRole('button', { name: 'Следующая неделя', exact: true }).click(); await expect(page.getByRole('button', { name: /^2026-11-30,/ })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ваша история впереди' })).toBeVisible();
});

test('program, library and template editors fit mobile widths in both themes', async ({ page }) => {
  await program(page);
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.getByRole('button', { name: 'Редактировать B', exact: true }).click(); await page.locator('.template-slot').nth(1).locator('summary').click();
    for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('button', { name: 'Библиотека упражнений', exact: true }).click(); await page.getByRole('button', { name: 'Создать упражнение', exact: true }).click();
    for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await page.getByRole('button', { name: 'К программе', exact: true }).click();
  }
});
