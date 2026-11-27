import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, discardDraft, finishSession, LogDatabase, saveSession, startSession } from './database';
import { initialExercises, initialProgram, initialSettings, initialTemplates } from '../data/seed';
import { createSession } from '../domain/session';
import type { WorkoutSession } from '../domain/models';
import { progress } from '../domain/workout';

beforeEach(async () => { await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
async function record(session: WorkoutSession, all = false, weight = 20) {
  session.exercises.forEach((exercise, index) => {
    if (all || index === 0) exercise.sets.forEach(set => Object.assign(set, { weightKg: weight, reps: 10, status: 'completed' }));
  });
  return saveSession(session, session.revision);
}
describe('training lifecycle', () => {
  it('starts without invented values, persists edits across reopen and rejects stale writes', async () => {
    const session = await startSession('A');
    expect(session.originalExercises).toHaveLength(7);
    expect(session.exercises.every(row => row.sets.every(set => set.weightKg === (row.exercise.weightMode === 'additional' ? 0 : null) && set.reps === null && set.status === 'pending'))).toBe(true);
    const edited = await record(session);
    db.close(); await db.open();
    expect((await db.sessions.get(session.id))?.exercises[0].sets[0].weightKg).toBe(20);
    await expect(saveSession(session, 0)).rejects.toThrow('другой вкладке');
    expect((await db.sessions.get(session.id))?.revision).toBe(edited.revision);
  });
  it('finishes a full session once, records duration, clears active state and advances A to B', async () => {
    const session = await record(await startSession('A'), true);
    const [a, b] = await Promise.all([finishSession(session.id, session.revision), finishSession(session.id, session.revision)]);
    expect(a.id).toBe(b.id); expect(a.status).toBe('completed'); expect(a.endedAt).not.toBeNull();
    expect(progress(a).missing).toBe(0);
    expect(await db.sessions.where('status').equals('completed').count()).toBe(1);
    expect((await db.program.get('program'))).toMatchObject({ nextTemplateId: 'B', completedCounts: { A: 1, B: 0, C: 0 }, activeSessionId: null });
  });
  it('records incomplete work but excludes unconfirmed preliminary values from history', async () => {
    const session = await startSession('A');
    Object.assign(session.exercises[0].sets[0], { weightKg: 0, reps: 8, status: 'completed' });
    Object.assign(session.exercises[0].sets[1], { weightKg: 100, reps: 20 });
    const saved = await saveSession(session, session.revision);
    const finished = await finishSession(saved.id, saved.revision);
    expect(progress(finished)).toMatchObject({ confirmed: 1, missing: 21 });
    expect(finished.exercises[0].sets[1]).toMatchObject({ weightKg: null, reps: null, status: 'skipped' });
    expect(finished.originalExercises[0].sets[1].status).toBe('pending');
  });
  it('keeps history and cycle intact on completion failure, then supports retry', async () => {
    const session = await record(await startSession('B', true));
    const before = await db.program.get('program');
    vi.spyOn(db.program, 'update').mockRejectedValueOnce(new Error('Simulated failure'));
    await expect(finishSession(session.id, session.revision)).rejects.toThrow('Simulated failure');
    expect(await db.program.get('program')).toEqual(before);
    expect(await db.sessions.get(session.id)).toEqual(session);
    await finishSession(session.id, session.revision);
    expect((await db.program.get('program'))?.nextTemplateId).toBe('C');
  });
  it('does not shift the cycle for manual workouts by default; explicit advance does', async () => {
    const b = await record(await startSession('B'));
    await finishSession(b.id, b.revision);
    expect((await db.program.get('program'))?.nextTemplateId).toBe('A');
    const c = await record(await startSession('C', true));
    await finishSession(c.id, c.revision);
    expect((await db.program.get('program'))?.nextTemplateId).toBe('A');
    const nextB = await record(await startSession('B', true));
    await finishSession(nextB.id, nextB.revision);
    expect((await db.program.get('program'))?.nextTemplateId).toBe('C');
  });
  it('alternates B only after its actual leg exercise was performed, never after skip or cancel', async () => {
    let b = await startSession('B');
    expect(b.exercises[1].exercise.id).toBe('split-squat');
    b.exercises[1].skipped = true;
    b = await saveSession(b, b.revision); await finishSession(b.id, b.revision);
    b = await startSession('B'); expect(b.exercises[1].exercise.id).toBe('split-squat');
    Object.assign(b.exercises[1].sets[0], { weightKg: 12.5, reps: 10, status: 'completed' });
    b = await saveSession(b, b.revision); await finishSession(b.id, b.revision);
    b = await startSession('B'); expect(b.exercises[1].exercise.id).toBe('squat');
    const before = await db.program.get('program'); await discardDraft(b.id);
    expect(await db.program.get('program')).toEqual({ ...before, activeSessionId: null });
    b = await startSession('B'); expect(b.exercises[1].exercise.id).toBe('squat');
  });
  it('prefills B and C separately, never marks prefills complete, carries weight to new sets', async () => {
    const b = await record(await startSession('B'), false, 21);
    await finishSession(b.id, b.revision);
    const c = await record(await startSession('C'), false, 31);
    await finishSession(c.id, c.revision);
    await db.templates.update('B', { slots: initialTemplates[1].slots.map((slot, index) => index === 0 ? { ...slot, sets: 4 } : slot) });
    const nextB = await startSession('B');
    expect(nextB.exercises[0].sets.map(set => [set.weightKg, set.reps, set.status])).toEqual([[21, 10, 'pending'], [21, 10, 'pending'], [21, 10, 'pending'], [21, null, 'pending']]);
    await discardDraft(nextB.id);
    const nextC = await startSession('C'); expect(nextC.exercises[0].sets[0].weightKg).toBe(31);
  });
  it('keeps unilateral results intact and excludes skipped optional work from mandatory target', async () => {
    let b = await startSession('B');
    b.exercises[1].separateSides = true;
    Object.assign(b.exercises[1].sets[0], { weightKg: 15, reps: 10, rightWeightKg: 12.5, rightReps: 8, status: 'completed' });
    b = await saveSession(b, b.revision);
    expect(progress(b).done).toBe(1);
    const finished = await finishSession(b.id, b.revision);
    expect(finished.exercises[1].sets[0]).toMatchObject({ weightKg: 15, reps: 10, rightWeightKg: 12.5, rightReps: 8 });
    expect(progress(finished).missing).toBe(18);
  });
});
describe('version 1 migration', () => {
  it('preserves edited library, settings, active draft and program while adding v2 fields', async () => {
    const name = 'log-migration-test';
    const legacy = new Dexie(name);
    legacy.version(1).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt' });
    const session = createSession(initialTemplates[0], initialProgram, initialExercises);
    const { revision, advanceCycle, originalExercises, ...oldSession } = session;
    const { alternationCount, ...oldProgram } = initialProgram;
    await legacy.table('sessions').add(oldSession);
    await legacy.table('settings').add({ ...initialSettings, theme: 'light' });
    await legacy.table('program').add({ ...oldProgram, activeSessionId: session.id });
    await legacy.table('exercises').add({ ...initialExercises[0], description: 'Моё пояснение' });
    await legacy.table('templates').bulkPut(structuredClone(initialTemplates)); legacy.close();
    const upgraded = new LogDatabase(name);
    try {
      const restored = await upgraded.sessions.get(session.id);
      expect(restored).toMatchObject({ revision: 0, advanceCycle: true, startedAt: session.startedAt });
      expect(restored?.originalExercises).toEqual(oldSession.exercises);
      expect((await upgraded.exercises.get('pull-up'))?.description).toBe('Моё пояснение');
      expect((await upgraded.settings.get('user'))?.theme).toBe('light');
      expect((await upgraded.program.get('program'))?.activeSessionId).toBe(session.id);
      expect((await upgraded.program.get('program'))?.alternationCount).toBe(0);
      expect(await upgraded.exercises.count()).toBe(1);
    } finally { await upgraded.delete(); }
  });
});
