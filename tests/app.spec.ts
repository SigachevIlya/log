import { expect, test } from '@playwright/test';

async function readStorage(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('log-diary');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['sessions', 'program'], 'readonly');
      const rows = tx.objectStore('sessions').getAll();
      const program = tx.objectStore('program').get('program');
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      return { sessions: rows.result, program: program.result };
    } finally { db.close(); }
  });
}

test('mobile program, descriptions, theme persistence and draft recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Тренировка A', exact: true })).toBeVisible();
  await expect(page.locator('.exercise-item')).toHaveCount(7);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /02 Горизонтальная тяга/ }).click();
  await expect(page.getByText(/Тяните к тазу с акцентом/)).toBeVisible();
  await page.getByRole('button', { name: 'Изменить пояснение' }).click();
  await page.getByLabel('Пояснение к упражнению').fill('Моё пояснение к тяге');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByLabel('Пояснение к упражнению')).toHaveCount(0);
  await expect(page.getByText('Моё пояснение к тяге', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /02 Горизонтальная тяга/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Моё пояснение к тяге', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'B Тренировка', exact: true }).click();
  await expect(page.getByText('+ 3 по желанию', { exact: true })).toBeVisible();
  await expect(page.getByText('Болгарские выпады', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Начать вне очереди', exact: true }).click();
  await expect(page.locator('.active-heading h1')).toBeVisible();
  await page.reload();

  await expect(page.locator('.active-heading h1')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить тренировку' }).click();
  await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать тренировку', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Прогресс', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ваша история впереди' })).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'На вашем устройстве' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('layout at phone and desktop sizes and program navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Программа тренировок', exact: true }).click();
  await expect(page.locator('.program-heading h1')).toBeVisible();
  await page.getByRole('button', { name: 'Действия с тренировкой C', exact: true }).click();
  await page.getByRole('button', { name: 'Просмотреть C', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка C', exact: true })).toBeVisible();
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Scroll to the main action to verify it can be fully exposed above fixed navigation.
    await page.getByRole('button', { name: 'Начать тренировку', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Начать тренировку', exact: true })).toBeInViewport();
    const nav = await page.locator('.bottom-nav').boundingBox();
    const button = await page.getByRole('button', { name: 'Начать тренировку', exact: true }).boundingBox();
    expect(nav?.width).toBeLessThanOrEqual(680);
    expect(button?.height).toBeGreaterThanOrEqual(44);
    expect(button!.y + button!.height).toBeLessThanOrEqual(nav!.y);
  }
});

for (const host of ['localhost', process.env.LOG_LAN_HOST]) {
  test(`draft lifecycle over HTTP ${host ?? 'LAN (set LOG_LAN_HOST)'}`, async ({ page }, testInfo) => {
    test.skip(!host, 'Set LOG_LAN_HOST to an actual LAN IPv4 address to verify insecure HTTP.');
    const url = new URL(testInfo.project.use.baseURL!);
    url.hostname = host!;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url.href);
    await expect(page.locator('.primary-button')).toBeVisible();
    const apis = await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, random: typeof crypto.getRandomValues, clone: typeof structuredClone }));
    expect(apis).toEqual({ secure: host === 'localhost', uuid: host === 'localhost' ? 'function' : 'undefined', random: 'function', clone: 'function' });
    await page.locator('.primary-button').click();
    await expect(page.locator('.active-heading h1')).toBeVisible();
    const first = page.locator('.active-exercise').first();
    await first.getByRole('textbox', { name: 'Вес 1', exact: true }).fill('12,5');
    await first.getByRole('textbox', { name: 'Повторы 1', exact: true }).fill('10');
    await first.getByRole('button', { name: 'Подтвердить подход 1', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('Сохранено на устройстве');
    const before = await readStorage(page);
    expect(before.sessions).toHaveLength(1);
    expect(before.program.activeSessionId).toBe(before.sessions[0].id);
    expect(before.sessions[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await page.reload();

    await expect(page.locator('.active-heading h1')).toBeVisible();
    expect(await readStorage(page)).toEqual(before);
    await page.getByRole('button', { name: 'Отменить тренировку' }).click();
    await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Начать тренировку', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Начать тренировку', exact: true })).toBeVisible();
    const after = await readStorage(page);
    expect(after.sessions).toHaveLength(0);
    expect(after.program.activeSessionId).toBeNull();
    expect(after.program.completedCounts).toEqual({ A: 0, B: 0, C: 0 });
    expect(errors).toEqual([]);
  });
}

test('main action fits without scrolling at 667px height in both themes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.primary-button')).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 667 });
      for (let index = 0; index < 3; index++) {
        await page.locator('.template-tab').nth(index).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        const action = await page.locator('.primary-button').boundingBox();
        const nav = await page.locator('.bottom-nav').boundingBox();
        expect(action!.y).toBeGreaterThanOrEqual(0);
        expect(action!.y + action!.height).toBeLessThanOrEqual(nav!.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollY === 0)).toBe(true);
        for (const item of await page.locator('.nav-item').all()) {
          const box = await item.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const link = await page.locator('.program-link').boundingBox();
      const nav = await page.locator('.bottom-nav').boundingBox();
      expect(link!.y + link!.height).toBeLessThanOrEqual(nav!.y);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
});

test('original write failures are logged and do not leave a partial session', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('.primary-button')).toBeVisible();
  await page.evaluate(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: () => { throw new Error('Simulated UUID failure'); } }));
  await page.locator('.primary-button').click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(messages.some(message => message.includes('[LOG.] Начало или восстановление тренировки') && message.includes('Simulated UUID failure'))).toBe(true);
  const stored = await readStorage(page);
  expect(stored.sessions).toHaveLength(0);
  expect(stored.program.activeSessionId).toBeNull();
});
