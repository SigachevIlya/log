import { db } from './database';
import { createId } from '../domain/id';
import type { BodyWeightEntry } from '../domain/models';
export async function saveBodyWeight(draft: Omit<BodyWeightEntry, 'id'> & { id?: string }, expected: number | null) {
  const time = Date.parse(draft.measuredAt);
  if (!Number.isFinite(time) || time > Date.now()) throw new Error('Укажите дату и время измерения не позже текущего момента.');
  if (!Number.isFinite(draft.weightKg) || draft.weightKg <= 0 || draft.weightKg > 1000) throw new Error('Введите вес больше нуля и не более 1000 кг.');
  return db.transaction('rw', db.bodyWeights, async () => {
    const old = draft.id ? await db.bodyWeights.get(draft.id) : undefined;
    if (expected !== null && (!old || (old.revision ?? 0) !== expected)) throw new Error('Измерение изменено или удалено в другой вкладке. Откройте его заново.');
    if (expected === null && old) throw new Error('Измерение уже существует.');
    const saved: BodyWeightEntry = { id: old?.id ?? draft.id ?? createId(), measuredAt: new Date(time).toISOString(), weightKg: draft.weightKg, revision: (old?.revision ?? -1) + 1 };
    await db.bodyWeights.put(saved); return saved;
  });
}
export async function deleteBodyWeight(id: string, expected: number) {
  return db.transaction('rw', db.bodyWeights, async () => {
    const old = await db.bodyWeights.get(id);
    if (!old || (old.revision ?? 0) !== expected) throw new Error('Измерение изменено или удалено в другой вкладке. Откройте его заново.');
    await db.bodyWeights.delete(id);
  });
}
