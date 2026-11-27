import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, LogDatabase, startSession, saveSession, finishSession } from './database';
import { saveBodyWeight, deleteBodyWeight } from './bodyWeight';
import { saveHistory, deleteHistory } from './history';
import { buildAnalytics, pointValue } from '../domain/analytics';
import { initialExercises, initialProgram, initialSettings, initialTemplates } from '../data/seed';
import { createSession } from '../domain/session';
beforeEach(async () => { await db.open(); });
afterEach(async () => { await db.delete(); });
describe('weight measurements, revisions and recalculation', () => {
  it('creates, edits and deletes a fractional measurement atomically', async () => {
    const created = await saveBodyWeight({ measuredAt: '2026-01-01T08:30:00Z', weightKg: 72.35 }, null); expect(created.revision).toBe(0);
    const edited = await saveBodyWeight({ ...created, weightKg: 73.2 }, 0); expect(edited.id).toBe(created.id); expect(edited.revision).toBe(1);
    await expect(saveBodyWeight({ ...created, weightKg: 80 }, 0)).rejects.toThrow('другой вкладке'); await expect(deleteBodyWeight(created.id, 0)).rejects.toThrow('другой вкладке');
    expect((await db.bodyWeights.get(created.id))?.weightKg).toBe(73.2); await deleteBodyWeight(created.id, 1); expect(await db.bodyWeights.count()).toBe(0);
  });
  it('rejects invalid values, dates and future measurements without a partial write', async () => { for (const weightKg of [0, -1, NaN, Infinity]) await expect(saveBodyWeight({ measuredAt: '2026-01-01T08:30:00Z', weightKg }, null)).rejects.toThrow(); await expect(saveBodyWeight({ measuredAt: 'not-a-date', weightKg: 70 }, null)).rejects.toThrow(); await expect(saveBodyWeight({ measuredAt: new Date(Date.now() + 86_400_000).toISOString(), weightKg: 70 }, null)).rejects.toThrow(); expect(await db.bodyWeights.count()).toBe(0); });
  it('recalculates pull-up strength when a measurement is edited or deleted', async () => {
    const value = createSession(initialTemplates[0], initialProgram, initialExercises, new Date('2026-01-02T12:00:00Z')); value.status = 'incomplete'; value.endedAt = value.startedAt; Object.assign(value.exercises[0].sets[0], { weightKg: 10, reps: 6, status: 'completed' });
    const created = await saveBodyWeight({ measuredAt: '2026-01-01T08:30:00Z', weightKg: 70 }, null);
    expect(pointValue(buildAnalytics([value], await db.bodyWeights.toArray()).series[0].points[0], 'strength')).toBe(96);
    const updated = await saveBodyWeight({ ...created, weightKg: 75 }, 0); expect(pointValue(buildAnalytics([value], await db.bodyWeights.toArray()).series[0].points[0], 'strength')).toBe(102);
    await deleteBodyWeight(updated.id, 1); expect(pointValue(buildAnalytics([value], await db.bodyWeights.toArray()).series[0].points[0], 'strength')).toBeNull();
  });
  it('updates derived results after actual history edits/deletion without derivative tables', async () => {
    let active = await startSession('C', false); Object.assign(active.exercises[0].sets[0], { weightKg: 20, reps: 10, status: 'completed' }); active = await saveSession(active, active.revision); const historical = await finishSession(active.id, active.revision);
    const changed = structuredClone(historical); changed.exercises[0].sets[0].weightKg = 25; const updated = await saveHistory(changed, historical.revision);
    expect(pointValue(buildAnalytics(await db.sessions.toArray()).series[0].points[0], 'weight')).toBe(25);
    await deleteHistory(updated.id, updated.revision); expect(buildAnalytics(await db.sessions.toArray()).series).toEqual([]); expect(db.tables.map(table => table.name)).not.toContain('analytics');
  });
});
it('migrates v4 to v5 without changing historical/active snapshots or user settings/program', async () => {
  const name = 'log-v4-analytics-migration', legacy = new Dexie(name);
  legacy.version(4).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt', scheduleExceptions: 'id, date, targetDate' });
  const exercise = { ...initialExercises[4], loadCalculation: undefined, bodyWeightModel: undefined, name: 'Пользовательское название' };
  const active = createSession(initialTemplates[0], initialProgram, initialExercises), history = { ...structuredClone(active), id: 'old-history', status: 'incomplete', endedAt: active.startedAt };
  history.exercises.forEach(row => { delete row.exercise.loadCalculation; delete row.exercise.bodyWeightModel; delete row.exercise.primaryMuscle; });
  const program = { ...initialProgram, sequence: ['C', 'A', 'B'], nextTemplateId: 'C', activeSessionId: active.id, cycleRevision: 17 };
  await legacy.table('exercises').add(exercise); await legacy.table('templates').bulkAdd(structuredClone(initialTemplates)); await legacy.table('sessions').bulkAdd([active, history]); await legacy.table('program').add(program); await legacy.table('settings').add({ ...initialSettings, theme: 'light', trainingDays: [1, 5] }); await legacy.table('bodyWeights').add({ id: 'old-weight', measuredAt: '2026-01-01T08:30:00Z', weightKg: 72.5 }); legacy.close();
  const migrated = new LogDatabase(name);
  try { await migrated.open(); expect(migrated.verno).toBe(6); expect((await migrated.metadata.get('state'))?.epoch).toBeTruthy(); expect(await migrated.sessions.get(history.id)).toEqual(history); expect(await migrated.sessions.get(active.id)).toEqual(active); expect(await migrated.program.get('program')).toEqual(program); expect(await migrated.settings.get('user')).toMatchObject({ theme: 'light', trainingDays: [1, 5], recommendationsEnabled: true }); expect(await migrated.exercises.get(exercise.id)).toMatchObject({ name: exercise.name, loadCalculation: 'unknown', bodyWeightModel: 'unknown' }); expect((await migrated.bodyWeights.get('old-weight'))?.revision).toBe(0); expect(await migrated.sessions.count()).toBe(2); } finally { await migrated.delete(); }
});
