import { initialExercises, initialProgram, initialSettings, initialTemplates } from '../../src/data/seed';
import { withExerciseMetadata } from '../../src/data/muscles';
import { createSession } from '../../src/domain/session';
import { classify } from '../../src/domain/workout';
import type { Page } from '@playwright/test';
export function auditData() {
  const library = initialExercises.map(withExerciseMetadata).map(row => row.id === 'incline-press' ? { ...row, name: 'Наклонный жим гантелей — длинное название для проверки мобильного экрана' } : row);
  const templates = structuredClone(initialTemplates).map(row => ({ ...row, code: row.code ?? row.id, description: '', archived: false })), history = Array.from({ length: 60 }, (_, index) => {
    const template = templates[index % templates.length], start = new Date(2026, 7, 1 + index * 2, 12), slot = templates.find(row => row.id === 'B')!.slots.find(row => row.id === 'B-2')!;
    const program = { ...initialProgram, alternationNext: { ...initialProgram.alternationNext, 'B-2': slot.exerciseIds[Math.floor(index / 3) % slot.exerciseIds.length] } };
    const session = createSession(template, program, library, start); session.id = 'audit-' + index; session.endedAt = new Date(start.getTime() + (40 + index % 20) * 60_000).toISOString();
    session.exercises.forEach((row, rowIndex) => {
      row.separateSides = row.exercise.unilateral;
      row.sets.forEach((set, setIndex) => {
        const weight = row.exercise.weightMode === 'bodyweight' ? 0 : row.exercise.id === 'incline-press' ? (({ 53: 30, 55: 32, 56: 34, 58: 36, 59: 35 } as Record<number, number>)[index] ?? 22 + Math.floor(index / 12) * 2) : 20;
        const reps = row.exercise.id === 'incline-press' ? 12 : row.exercise.id === 'barbell-curl' ? Math.min(12, 8 + Math.floor(index / 12)) : 10;
        Object.assign(set, { weightKg: weight, reps, rightWeightKg: row.separateSides ? weight - 2 : undefined, rightReps: row.separateSides ? reps - 1 : undefined, status: index % 13 === 0 || row.optional || (index % 11 === 0 && rowIndex === 1 && setIndex > 0) ? 'skipped' : 'completed' });
      });
    });
    session.notes = index % 11 === 0 ? 'Неполная тренировка: оставил часть подходов.' : '';
    session.status = classify(session); return session;
  });
  const bodyWeights = Array.from({ length: 16 }, (_, index) => ({ id: 'audit-weight-' + index, measuredAt: new Date(2026, 9, 28 + index * 2, 9).toISOString(), weightKg: 72 + index * .08 + Math.sin(index) * .15, revision: 0 }));
  return { library, templates, history, bodyWeights, settings: { ...initialSettings }, program: structuredClone(initialProgram) };
}
export async function seedAudit(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-27T14:00:00+03:00')); await page.goto('/#/progress'); await page.locator('.dashboard-stats').waitFor();
  await page.evaluate(async value => {
    const request = indexedDB.open('log-diary'), database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = database.transaction(['exercises', 'templates', 'sessions', 'bodyWeights'], 'readwrite');
    for (const row of value.library) tx.objectStore('exercises').put(row); for (const row of value.templates) tx.objectStore('templates').put(row); for (const row of value.history) tx.objectStore('sessions').put(row); for (const row of value.bodyWeights) tx.objectStore('bodyWeights').put(row);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); database.close();
  }, auditData());
  await page.reload(); await page.locator('.dashboard-stats').waitFor();
}
