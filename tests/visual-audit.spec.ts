import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { seedAudit } from './helpers/audit-data';
test('filled isolated visual audit and compact overview', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await seedAudit(page); await mkdir('visual-audit', { recursive: true });
  const metrics = [];
  const routes = ['progress', 'progress/exercises', 'progress/exercise/incline-press', 'progress/volume', 'progress/records', 'progress/recommendations', 'progress/body', 'workout', 'history', 'history/audit-59/edit', 'program', 'program/library', 'program/template/B', 'settings', 'settings/guide', 'settings/data'];
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click();
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 667 });
      for (const route of routes) {
        await page.goto('/#/' + route); await expect(page.locator('main h1, main h2').first()).toBeVisible(); await page.evaluate(() => scrollTo(0, 0));
        if (route !== 'workout') await expect(page.locator('main h1')).toHaveCount(1);
        if (route === 'workout' && width === 375) { const action = await page.getByRole('button', { name: 'Начать тренировку', exact: true }).boundingBox(), nav = await page.locator('.bottom-nav').boundingBox(); expect(action!.y + action!.height).toBeLessThanOrEqual(nav!.y); }
        if (route === 'progress') { await expect(page.locator('.dashboard-stats')).toContainText('Тренировки'); await expect(page.locator('.progress-links')).toBeVisible(); if (width === 375) { const first = await page.locator('.progress-links button').first().boundingBox(), nav = await page.locator('.bottom-nav').boundingBox(); expect(first!.y + 24).toBeLessThan(nav!.y); await page.screenshot({ path: 'visual-audit/progress-' + theme + '-viewport.png' }); } }
        if (width === 375 && route.startsWith('progress')) await page.screenshot({ path: 'visual-audit/' + route.replaceAll('/', '-') + '-' + theme + '.png', fullPage: true });
        const metric = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, fieldsAtLeast16: [...document.querySelectorAll('input:not([type=checkbox]),select,textarea')].every(element => parseFloat(getComputedStyle(element).fontSize) >= 16) }));
        metrics.push({ theme, width, route, ...metric }); expect(metric.overflow, route + ' ' + theme + ' ' + width).toBe(false); expect(metric.fieldsAtLeast16).toBe(true);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); const nav = await page.locator('.bottom-nav').boundingBox(), last = await page.locator('main').evaluate(element => element.getBoundingClientRect().bottom - parseFloat(getComputedStyle(element).paddingBottom)); expect(last).toBeLessThanOrEqual(nav!.y + 1);
      }
    }
  }
  await page.goto('/#/workout'); await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click(); await expect(page.locator('.active-heading')).toBeVisible();
  for (const theme of ['dark', 'light']) { if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.header-right button').click(); for (const width of [320, 375, 390]) { await page.setViewportSize({ width, height: 667 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); metrics.push({ theme, width, route: 'workout/active', overflow: false, fieldsAtLeast16: await page.locator('input').evaluateAll(elements => elements.every(element => parseFloat(getComputedStyle(element).fontSize) >= 16)) }); if (width === 375) await page.screenshot({ path: 'visual-audit/active-' + theme + '.png', fullPage: true }); } }
  await writeFile('visual-audit/metrics.json', JSON.stringify({ errors, metrics }, null, 2)); expect(errors).toEqual([]);
});
