import { expect, test, type Page } from '@playwright/test';
import { createSession } from '../src/domain/session';
import { initialExercises, initialProgram, initialTemplates } from '../src/data/seed';
async function openTemplate(page: Page, id = 'A') { await page.goto(`/#/program/template/${id}`); await expect(page.locator('.template-editor')).toBeVisible(); }
async function readRecord(page: Page, table: string, id: string) { return page.evaluate(async ({ table, id }) => { const open = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); }); try { const request = db.transaction(table).objectStore(table).get(id); return await new Promise<any>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); } }, { table, id }); }

test('hash sections reload, browser back/forward work and missing objects redirect to parents', async ({ page }) => {
  await page.goto('/');
  for (const [label, path] of [['Прогресс', 'progress'], ['История', 'history'], ['Настройки', 'settings'], ['Тренировка', 'workout']]) {
    await page.getByRole('button', { name: label, exact: true }).click(); await expect(page).toHaveURL(new RegExp(`#/${path}$`)); await page.reload(); await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goBack(); await expect(page).toHaveURL(/#\/settings$/); await page.goForward(); await expect(page).toHaveURL(/#\/workout$/);
  for (const [path, parent] of [['program/template/missing', 'program'], ['program/library/missing', 'program/library'], ['history/missing', 'history'], ['workout/active', 'workout'], ['unknown', 'workout']]) { await page.goto(`/#/${path}`); await expect(page).toHaveURL(new RegExp(`#/${parent}$`)); }
});

test('active route restores the selected exercise and results without putting personal data in the URL', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  const row = page.locator('.active-exercise').nth(1); await row.locator('.active-exercise-toggle').click();
  await row.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('12,5'); await row.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('10'); await row.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('Сохранено на устройстве'); await page.reload();
  await expect(page).toHaveURL(/#\/workout\/active$/); await expect(row.locator('.active-exercise-toggle')).toHaveAttribute('aria-expanded', 'true'); await expect(row.getByRole('textbox', { name: 'Вес 1', exact: true })).toHaveValue('12,5');
  expect(new URL(page.url()).hash).not.toContain('12'); expect(new URL(page.url()).hash).not.toContain('10');
});

test('template drafts recover synchronously on reload, keep base revisions and apply only on save', async ({ page }) => {
  await openTemplate(page); await page.locator('.template-info > summary').click(); await page.getByLabel('Название тренировки', { exact: true }).fill('Черновик после перезагрузки');
  const slot = page.locator('.template-slot').first(); await slot.locator('summary').click(); await slot.getByLabel('Подходы', { exact: true }).fill('5');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.getByLabel('Название тренировки', { exact: true })).toHaveValue('Черновик после перезагрузки'); await expect(slot.getByLabel('Подходы', { exact: true })).toHaveValue('5');
  await expect(page.getByText('Восстановлен черновик. Изменения ещё не применены.', { exact: true })).toBeVisible();
  expect((await readRecord(page, 'templates', 'A')).name).toBe('Тренировка A');
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click(); await expect(page).toHaveURL(/#\/program$/); expect((await readRecord(page, 'templates', 'A')).name).toBe('Черновик после перезагрузки');
  await page.getByRole('button', { name: 'Редактировать A', exact: true }).click(); await expect(page.getByRole('button', { name: 'Сохранить шаблон', exact: true })).toBeDisabled();
});

test('browser back may be cancelled and explicit editor cancellation discards its draft', async ({ page }) => {
  await page.goto('/#/program'); await page.getByRole('button', { name: 'Редактировать A', exact: true }).click(); await page.locator('.template-info > summary').click(); await page.getByLabel('Название тренировки', { exact: true }).fill('Не сохранять');
  page.once('dialog', dialog => dialog.dismiss()); await page.goBack(); await expect(page).toHaveURL(/#\/program\/template\/A$/); await expect(page.getByLabel('Название тренировки', { exact: true })).toHaveValue('Не сохранять');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(page).toHaveURL(/#\/program$/);
  await page.goBack(); await expect(page).toHaveURL(/#\/program\/template\/A$/); await expect(page.getByLabel('Название тренировки', { exact: true })).toHaveValue('Тренировка A');
  await page.goForward(); await expect(page).toHaveURL(/#\/program$/);
});

test('library filters and exercise drafts restore, and stale restored drafts cannot overwrite newer revisions', async ({ page }) => {
  await page.goto('/#/program/library'); await page.getByLabel('Поиск упражнений').fill('Подтяг'); await page.getByLabel('Мышечная группа', { exact: true }).selectOption('Широчайшие'); await page.reload();
  await expect(page.getByLabel('Поиск упражнений')).toHaveValue('Подтяг'); await expect(page.getByLabel('Мышечная группа', { exact: true })).toHaveValue('Широчайшие');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Черновик упражнения');
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Черновик упражнения');
  await page.evaluate(async () => { const open = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); }); const tx = db.transaction('exercises', 'readwrite'), store = tx.objectStore('exercises'), request = store.get('pull-up'); request.onsuccess = () => { store.put({ ...request.result, name: 'Изменено в другой вкладке', revision: request.result.revision + 1 }); }; await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close(); });
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await page.getByRole('button', { name: 'Сохранить упражнение', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('другой вкладке'); expect((await readRecord(page, 'exercises', 'pull-up')).name).toBe('Изменено в другой вкладке');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(page).toHaveURL(/#\/program\/library$/); await expect(page.getByLabel('Поиск упражнений')).toHaveValue('Подтяг');
});

test('week, calendar legend, multiple records and links to historical routes survive reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-27T12:00:00+03:00') }); await page.goto('/'); await page.getByRole('button', { name: 'Следующая неделя', exact: true }).click(); await page.reload(); await expect(page.getByRole('button', { name: /^2026-11-30,/ })).toBeVisible(); await page.getByRole('button', { name: 'Текущая неделя', exact: true }).click();
  const fixtures = ([['2026-11-24', 'completed'], ['2026-11-26', 'incomplete'], ['2026-11-25', 'skipped'], ['2026-11-27', 'incomplete'], ['2026-11-27', 'skipped']] as const).map(([date, status], index) => { const session = createSession(initialTemplates[0], initialProgram, initialExercises, new Date(`${date}T12:00:00+03:00`)); session.id = `calendar-test-${index}`; session.status = status; session.endedAt = session.startedAt; if (status !== 'skipped') Object.assign(session.exercises[0].sets[0], { weightKg: 0, reps: 12, status: 'completed' }); return session; });
  await page.evaluate(async rows => { const open = indexedDB.open('log-diary'); const db = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); }); const tx = db.transaction('sessions', 'readwrite'); rows.forEach(row => tx.objectStore('sessions').add(row)); await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close(); }, fixtures); await page.reload();
  await expect(page.locator('[data-calendar-state="incomplete"]')).toHaveCount(1); await expect(page.locator('[data-calendar-state="multiple"]')).toHaveCount(1);
  const day = page.getByRole('button', { name: /^2026-11-27, сегодня, Несколько записей тренировок, записей: 2/ }); await expect(day.locator('.day-record-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Обозначения', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('есть результаты, но не выполнена обязательная цель'); await expect(page.getByRole('dialog').locator('[data-calendar-state]')).toHaveCount(9); await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await day.click(); await expect(page.locator('.calendar-record-link')).toHaveCount(2); await page.locator('.calendar-record-link').first().click(); await expect(page).toHaveURL(/#\/history\/calendar-test-/); await page.reload(); await expect(page.locator('.history-heading')).toBeVisible(); await page.goBack(); await expect(page).toHaveURL(/#\/workout$/);
  await page.goForward(); await page.getByRole('button', { name: 'Редактировать тренировку', exact: true }).click();
  const exercise = page.locator('.history-edit-exercise').first(); await exercise.locator('summary').click(); await exercise.getByLabel('Заметка', { exact: true }).fill('Черновик истории');
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page).toHaveURL(/#\/history\/calendar-test-\d\/edit$/); await expect(exercise.getByLabel('Заметка', { exact: true })).toHaveValue('Черновик истории');
  const id = decodeURIComponent(new URL(page.url()).hash.split('/')[2]); expect((await readRecord(page, 'sessions', id)).exercises[0].notes).toBe('');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`#/history/${id}$`));
});

test('alternation settings hide only after confirmation and preserve variant order and next state', async ({ page }) => {
  await openTemplate(page, 'B'); const slot = page.locator('.template-slot').nth(1); await slot.locator('summary').click(); await slot.getByLabel('Чередовать варианты', { exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Закрыть', exact: true }).click(); await expect(slot.getByLabel('Чередовать варианты', { exact: true })).toBeChecked();
  await slot.getByLabel('Чередовать варианты', { exact: true }).click(); await page.getByLabel('Основное упражнение', { exact: true }).selectOption('squat'); await page.getByRole('button', { name: 'Отключить чередование', exact: true }).click(); await expect(slot.locator('.variant-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click(); const saved = await readRecord(page, 'templates', 'B'); expect(saved.slots[1].exerciseIds).toEqual(['split-squat', 'squat']); expect(saved.slots[1].primaryExerciseId).toBe('squat'); expect((await readRecord(page, 'program', 'program')).alternationNext['B-2']).toBe('split-squat');
});

test('sticky editor actions stay above navigation and fields remain accessible on mobile in both themes', async ({ page }) => {
  await openTemplate(page, 'B'); const slot = page.locator('.template-slot').nth(1); await slot.locator('summary').click();
  for (const theme of ['dark', 'light']) { if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme); for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const panel = await page.locator('.editor-action-bar').boundingBox(), nav = await page.locator('.bottom-nav').boundingBox(); expect(panel!.y + panel!.height).toBeLessThanOrEqual(nav!.y); const field = slot.getByLabel('Пояснение только для этой тренировки'); await field.scrollIntoViewIfNeeded(); const box = await field.boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(panel!.y); } }
});

test('cycle and regular-day drafts also recover without applying themselves, and scroll is restored', async ({ page }) => {
  await page.goto('/#/program/cycle'); await page.getByLabel('Название программы', { exact: true }).fill('Черновой цикл'); page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('Название программы', { exact: true })).toHaveValue('Черновой цикл'); expect((await readRecord(page, 'program', 'program')).name).toBe('Основная программа'); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click(); await page.getByRole('button', { name: 'Изменить тренировочные дни', exact: true }).click(); await page.getByRole('checkbox', { name: 'Понедельник', exact: true }).check(); page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByRole('checkbox', { name: 'Понедельник', exact: true })).toBeChecked(); expect((await readRecord(page, 'settings', 'user')).trainingDays).toEqual([2, 4, 0]); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.goto('/#/program/library'); await expect(page.locator('[data-exercise-id]').first()).toBeVisible(); await page.evaluate(() => scrollTo(0, 500)); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400); await page.reload(); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
});

test('home explanations and their unsaved editor restore without changing the exercise', async ({ page }) => {
  await page.goto('/'); const row = page.locator('.exercise-item').first(); await row.locator('.exercise-toggle').click(); await row.getByRole('button', { name: 'Изменить пояснение', exact: true }).click(); await row.getByLabel('Пояснение к упражнению', { exact: true }).fill('Черновое пояснение');
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(row.locator('.exercise-toggle')).toHaveAttribute('aria-expanded', 'true'); await expect(row.getByLabel('Пояснение к упражнению', { exact: true })).toHaveValue('Черновое пояснение'); expect((await readRecord(page, 'exercises', 'pull-up')).description).not.toBe('Черновое пояснение');
  await row.getByRole('button', { name: 'Отмена', exact: true }).click(); await page.reload(); await expect(row.getByLabel('Пояснение к упражнению', { exact: true })).toHaveCount(0); await expect(row.locator('.exercise-toggle')).toHaveAttribute('aria-expanded', 'true');
});
