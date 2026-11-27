import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { addException, removeException, saveDays } from './calendar';
import { dateKey, dayPlan, localDate, upcomingDate } from '../domain/calendar';
import { weekDates } from '../domain/schedule';
import { createSession } from '../domain/session';
import { initialExercises, initialProgram, initialTemplates } from '../data/seed';
beforeEach(async () => { await db.open(); }); afterEach(async () => { await db.delete(); });
describe('calendar and dates', () => {
  it('validates 1–7 training days with optimistic conflicts', async () => {
    await expect(saveDays([], 0)).rejects.toThrow('Выберите'); await expect(saveDays([2, 2], 0)).rejects.toThrow();
    await saveDays([1, 3, 5, 6], 0); expect((await db.settings.get('user'))?.trainingDays).toEqual([1, 3, 5, 6]); await expect(saveDays([0], 0)).rejects.toThrow('другой вкладке');
  });
  it('moves a Sunday to Saturday once without changing the cycle or following week', async () => {
    const before = await db.program.get('program'); const row = await addException('move', '2026-11-29', '2026-11-28', 0);
    const exceptions = await db.scheduleExceptions.toArray(); expect(dayPlan(localDate('2026-11-29'), [2, 4, 0], exceptions).planned).toBe(false); expect(dayPlan(localDate('2026-11-28'), [2, 4, 0], exceptions).kind).toBe('moved');
    expect(dayPlan(localDate('2026-12-06'), [2, 4, 0], exceptions).planned).toBe(true); expect(await db.program.get('program')).toEqual(before); expect(await db.sessions.count()).toBe(0);
    await removeException(row.id, 1); expect(await db.scheduleExceptions.count()).toBe(0);
  });
  it('rejects occupied transfer targets and duplicate additional days atomically', async () => {
    await expect(addException('move', '2026-11-29', '2026-11-26', 0)).rejects.toThrow('уже есть'); expect(await db.scheduleExceptions.count()).toBe(0);
    await addException('extra', '2026-11-28', undefined, 0); await expect(addException('extra', '2026-11-28', undefined, 1)).rejects.toThrow('уже есть');
  });
  it('skips a date without debt or history and computes the next date from regular and extra days', async () => {
    await addException('skip', '2026-11-29', undefined, 0); await addException('extra', '2026-11-30', undefined, 1);
    const next = upcomingDate(localDate('2026-11-27'), [2, 4, 0], await db.scheduleExceptions.toArray(), []); expect(dateKey(next!)).toBe('2026-11-30'); expect(await db.sessions.count()).toBe(0); expect((await db.program.get('program'))?.nextTemplateId).toBe('A');
  });
  it('uses local calendar dates and spans month/year boundaries without UTC day shifts', () => {
    expect(dateKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31'); const week = weekDates(localDate('2027-01-01')); expect(dateKey(week[0])).toBe('2026-12-28'); expect(dateKey(week[6])).toBe('2027-01-03'); expect(() => localDate('2026-02-30')).toThrow('Некорректная');
  });
  it('does not propose a date already recorded as an actual completed or skipped session', () => {
    const old = createSession(initialTemplates[0], initialProgram, initialExercises, localDate('2026-11-29')); old.status = 'incomplete';
    expect(dateKey(upcomingDate(localDate('2026-11-29'), [2, 4, 0], [], [old])!)).toBe('2026-12-01');
    old.status = 'skipped'; expect(dateKey(upcomingDate(localDate('2026-11-29'), [2, 4, 0], [], [old])!)).toBe('2026-12-01');
  });
});
