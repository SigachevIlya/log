import { db } from './database';
import { dayPlan, localDate } from '../domain/calendar';
import { createId } from '../domain/id';
import type { ScheduleException } from '../domain/models';
export async function saveDays(days: number[], expected: number) {
  await db.transaction('rw', db.settings, async () => {
    const settings = (await db.settings.get('user'))!;
    if ((settings.scheduleRevision ?? 0) !== expected) throw new Error('Расписание изменено в другой вкладке. Откройте его заново.');
    if (!days.length || days.length > 7 || new Set(days).size !== days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Выберите от одного до семи разных дней.');
    await db.settings.update('user', { trainingDays: [...days], scheduleRevision: expected + 1 });
  });
}
export async function addException(kind: ScheduleException['kind'], date: string, targetDate: string | undefined, expected: number) {
  return db.transaction('rw', [db.settings, db.scheduleExceptions], async () => {
    const settings = (await db.settings.get('user'))!, all = await db.scheduleExceptions.toArray();
    if ((settings.scheduleRevision ?? 0) !== expected) throw new Error('Расписание изменилось. Откройте дату заново.');
    const source = dayPlan(localDate(date), settings.trainingDays, all);
    if (all.some(row => row.date === date || row.targetDate === date)) throw new Error('У этой даты уже есть изменение. Сначала отмените его.');
    if (kind === 'extra' && source.planned) throw new Error('Это уже тренировочный день. Дубликат не создан.');
    if (kind !== 'extra' && !source.planned) throw new Error('Дата не является запланированным тренировочным днём.');
    if (kind === 'move') {
      if (!targetDate || targetDate === date || dayPlan(localDate(targetDate), settings.trainingDays, all).planned || all.some(row => row.date === targetDate || row.targetDate === targetDate)) throw new Error('На выбранной дате уже есть тренировка или изменение. Выберите другую дату либо отмените перенос.');
    }
    const row: ScheduleException = { id: createId(), kind, date, targetDate: kind === 'move' ? targetDate : undefined, revision: 0 };
    await db.scheduleExceptions.add(row); await db.settings.update('user', { scheduleRevision: expected + 1 }); return row;
  });
}
export async function removeException(id: string, expected: number) {
  await db.transaction('rw', [db.settings, db.scheduleExceptions], async () => {
    const settings = (await db.settings.get('user'))!;
    if ((settings.scheduleRevision ?? 0) !== expected) throw new Error('Расписание изменилось. Откройте дату заново.');
    await db.scheduleExceptions.delete(id); await db.settings.update('user', { scheduleRevision: expected + 1 });
  });
}
