import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, discardDraft, LogDatabase, startSession } from './database';

beforeEach(async () => { await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
describe('local storage lifecycle', () => {
  it('rolls back the snapshot if updating the active pointer fails', async () => {
    vi.spyOn(db.program, 'update').mockRejectedValueOnce(new Error('Simulated write failure'));
    await expect(startSession('A')).rejects.toThrow('Simulated write failure');
    expect(await db.sessions.count()).toBe(0);
    expect((await db.program.get('program'))?.activeSessionId).toBeNull();
    expect(await db.templates.count()).toBe(3);
  });
  it('seeds once, keeps user changes on reopen and never seeds results', async () => {
    await db.open();
    expect(await db.templates.count()).toBe(3);
    expect(await db.exercises.count()).toBe(19);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.bodyWeights.count()).toBe(0);
    await db.exercises.update('pull-up', { description: 'Моя заметка' });
    await db.settings.update('user', { theme: 'light' });
    db.close();
    const reopened = new LogDatabase(db.name);
    try {
      expect((await reopened.exercises.get('pull-up'))?.description).toBe('Моя заметка');
      expect((await reopened.settings.get('user'))?.theme).toBe('light');
      expect(await reopened.templates.count()).toBe(3);
    } finally { reopened.close(); }
  });
  it('serializes simultaneous starts, persists a snapshot and does not advance the cycle', async () => {
    const [a, b] = await Promise.all([startSession('B'), startSession('C')]);
    expect(a.id).toBe(b.id);
    expect(await db.sessions.count()).toBe(1);
    const program = await db.program.get('program');
    expect(program?.activeSessionId).toBe(a.id);
    expect(program?.nextTemplateId).toBe('A');
    expect(program?.completedCounts.B).toBe(0);
    expect(a.exercises[1].exercise.id).toBe('split-squat');
    await db.exercises.update('split-squat', { description: 'Новая техника' });
    expect((await db.sessions.get(a.id))?.exercises[1].exercise.description).not.toBe('Новая техника');
    await discardDraft(a.id);
    expect(await db.sessions.count()).toBe(0);
    expect((await db.program.get('program'))?.activeSessionId).toBeNull();
    expect((await db.program.get('program'))?.completedCounts.B).toBe(0);
  });
});
