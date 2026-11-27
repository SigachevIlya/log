import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, startSession, saveSession, finishSession, discardDraft, LogDatabase } from './database';
import { deleteHistory, saveHistory } from './history';
import { classify, progress } from '../domain/workout';
import { initialExercises, initialProgram, initialTemplates } from '../data/seed';
import { createSession } from '../domain/session';
import { plural, naturalDuration, resultText } from '../domain/format';

beforeEach(async () => { await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
async function finish(id = 'A') {
  let row = await startSession(id, true);
  Object.assign(row.exercises[0].sets[0], { weightKg: 5, reps: 10, status: 'completed' });
  row = await saveSession(row, row.revision);
  return finishSession(row.id, row.revision);
}
describe('statuses and history', () => {
  it('rolls back both cycle restoration and deletion if removing the row fails', async () => {
    const session = await finish(); const before = await db.program.get('program');
    vi.spyOn(db.sessions, 'delete').mockRejectedValueOnce(new Error('Delete failed'));
    await expect(deleteHistory(session.id, session.revision, true)).rejects.toThrow('Delete failed');
    expect(await db.program.get('program')).toEqual(before);
    expect(await db.sessions.get(session.id)).toEqual(session);
  });
  it('edits separate-side history results without advancing the alternating exercise', async () => {
    const old = await finish('B'); const before = await db.program.get('program');
    const row = old.exercises[1]; row.separateSides = true; row.skipped = false;
    Object.assign(row.sets[0], { weightKg: 20, reps: 10, rightWeightKg: 17.5, rightReps: 8, status: 'completed' });
    const saved = await saveHistory(old, old.revision);
    expect(saved.exercises[1].sets[0]).toMatchObject({ rightWeightKg: 17.5, rightReps: 8 });
    expect(await db.program.get('program')).toEqual(before);
  });
  it('saves a skip atomically without moving cycle, counts or alternation and never prefills it', async () => {
    let session = await startSession('B', true);
    session.exercises[0].sets[0].weightKg = 99; session.exercises[0].sets[0].reps = 12;
    session = await saveSession(session, session.revision);
    const before = await db.program.get('program');
    const skipped = await finishSession(session.id, session.revision);
    expect(skipped.status).toBe('skipped'); expect(progress(skipped).confirmed).toBe(0);
    expect(await db.program.get('program')).toMatchObject({ nextTemplateId: before!.nextTemplateId, alternationCount: before!.alternationCount, completedCounts: before!.completedCounts, activeSessionId: null });
    expect(skipped.exercises[0].sets[0].weightKg).toBeNull();
    const fresh = await startSession('B'); expect(fresh.exercises[0].sets[0].weightKg).toBeNull();
  });
  it('retains original goals after deleting every set; optional work never changes mandatory completeness', async () => {
    const session = createSession(initialTemplates[1], initialProgram, initialExercises);
    session.exercises.forEach(row => { row.sets = []; });
    expect(progress(session)).toMatchObject({ total: 19, actualTotal: 0, missing: 19 });
    expect(classify(session)).toBe('skipped');
    session.exercises[0].sets.push({ id: 'new', weightKg: 10, reps: 8, status: 'completed' });
    expect(classify(session)).toBe('incomplete');
    const full = createSession(initialTemplates[1], initialProgram, initialExercises);
    full.exercises.filter(row => !row.optional).forEach(row => row.sets.forEach(set => Object.assign(set, { weightKg: 10, reps: 8, status: 'completed' })));
    expect(classify(full)).toBe('completed');
  });
  it('edits the same history record, updates status, preserves cycle and rejects stale saves', async () => {
    const old = await finish(); const program = await db.program.get('program');
    const draft = structuredClone(old); draft.exercises[0].sets[0].weightKg = 15;
    draft.exercises[0].sets.push({ id: 'forgotten', weightKg: 20, reps: 12, status: 'completed' });
    draft.endedAt = new Date(Date.parse(draft.startedAt) + 60000).toISOString();
    const saved = await saveHistory(draft, old.revision);
    expect(saved.id).toBe(old.id); expect(progress(saved).confirmed).toBe(2);
    expect(await db.program.get('program')).toEqual(program);
    await expect(saveHistory(draft, old.revision)).rejects.toThrow('другой вкладке');
    saved.exercises[0].sets = [];
    const skipped = await saveHistory(saved, saved.revision); expect(skipped.status).toBe('skipped');
    const fresh = await startSession('A'); expect(fresh.exercises[0].sets[0].weightKg).toBe(0);
  });
  it('deletes results without moving the cycle by default and excludes deleted prefills', async () => {
    const session = await finish(); const before = await db.program.get('program');
    await deleteHistory(session.id, session.revision);
    expect((await db.program.get('program'))?.nextTemplateId).toBe(before!.nextTemplateId);
    expect(await db.sessions.get(session.id)).toBeUndefined();
    expect((await startSession('A')).exercises[0].sets[0].weightKg).toBe(0);
  });
  it('safely restores the latest cycle and B alternation snapshot', async () => {
    let b = await startSession('B', true);
    Object.assign(b.exercises[1].sets[0], { weightKg: 12, reps: 10, status: 'completed' });
    b = await saveSession(b, b.revision); const finished = await finishSession(b.id, b.revision);
    expect((await db.program.get('program'))?.alternationCount).toBe(1);
    await deleteHistory(finished.id, finished.revision, true);
    expect(await db.program.get('program')).toMatchObject({ nextTemplateId: 'A', alternationCount: 0 });
  });
  it('rejects rollback with active work or a later dependent completion; leaves record intact', async () => {
    const a = await finish(); const active = await startSession('B');
    await expect(deleteHistory(a.id, a.revision, true)).rejects.toThrow('активная');
    await discardDraft(active.id); await finish('B');
    await expect(deleteHistory(a.id, a.revision, true)).rejects.toThrow('другие завершения');
    expect(await db.sessions.get(a.id)).toBeDefined();
  });
});
describe('migration and formatting', () => {
  it('classifies legacy empty/partial rows without rebuilding the program or fabricating rollback snapshots', async () => {
    const legacy = new Dexie('log-status-migration-test');
    legacy.version(2).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt' });
    const empty = createSession(initialTemplates[0], initialProgram, initialExercises); empty.status = 'completed';
    const partial = structuredClone(empty); partial.id = 'partial'; Object.assign(partial.exercises[0].sets[0], { weightKg: 0, reps: 12, status: 'completed' });
    await legacy.table('sessions').bulkAdd([empty, partial]);
    await legacy.table('program').add({ ...initialProgram, nextTemplateId: 'C', alternationCount: 7 }); await legacy.table('templates').bulkPut(structuredClone(initialTemplates)); legacy.close();
    const upgraded = new LogDatabase('log-status-migration-test');
    try {
      expect((await upgraded.sessions.get(empty.id))?.status).toBe('skipped');
      expect((await upgraded.sessions.get('partial'))?.status).toBe('incomplete');
      expect((await upgraded.program.get('program'))).toMatchObject({ nextTemplateId: 'C', alternationCount: 7 });
      expect((await upgraded.sessions.get(empty.id))?.cycleBefore).toBeUndefined();
    } finally { await upgraded.delete(); }
  });
  it('formats Russian numbers, natural durations and additional weights consistently', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map(n => plural(n, ['упражнение', 'упражнения', 'упражнений']))).toEqual(['упражнение', 'упражнения', 'упражнений', 'упражнений', 'упражнение', 'упражнения', 'упражнений', 'упражнений']);
    expect(naturalDuration('2026-01-01T00:00:00Z', '2026-01-01T00:24:57Z')).toBe('24 мин. 57 сек.');
    expect(naturalDuration('2026-01-01T00:00:00Z', '2026-01-01T01:35:00Z')).toBe('1 ч. 35 мин.');
    expect(resultText(initialExercises[0], { id: 's', weightKg: 0, reps: 12, status: 'completed' })).toBe('Собственный вес × 12');
    expect(resultText(initialExercises[0], { id: 's', weightKg: 5, reps: 10, status: 'completed' })).toBe('+5 кг × 10');
  });
});
