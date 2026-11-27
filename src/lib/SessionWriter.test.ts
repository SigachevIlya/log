import { describe, expect, it, vi } from 'vitest';
import { SessionWriter } from './SessionWriter';
import { createSession } from '../domain/session';
import { initialExercises, initialProgram, initialTemplates } from '../data/seed';
const session = () => createSession(initialTemplates[0], initialProgram, initialExercises);
describe('autosave queue', () => {
  it('serializes changes made while a write is pending and flushes the newest edit', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saved: string[] = [];
    const save = vi.fn(async (value, revision) => { await gate; saved.push(value.notes); return { ...value, revision: revision + 1 }; });
    const writer = new SessionWriter(session(), save);
    writer.change(value => { value.notes = 'first'; });
    await Promise.resolve();
    writer.change(value => { value.notes = 'latest'; });
    release();
    expect(await writer.flush()).toBe(true);
    expect(saved).toEqual(['first', 'latest']);
    expect(writer.getSnapshot()).toMatchObject({ dirty: false, error: '', saving: false, session: { notes: 'latest', revision: 2 } });
  });
  it('retains unsaved values, reports failure and retries without claiming success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockImplementation(async (value, revision) => ({ ...value, revision: revision + 1 }));
    try {
      const writer = new SessionWriter(session(), save);
      writer.change(value => { value.exercises[0].notes = 'unsaved'; });
      expect(await writer.flush()).toBe(false);
      expect(writer.getSnapshot()).toMatchObject({ dirty: true, error: 'Disk full', saving: false });
      expect(writer.getSnapshot().session.exercises[0].notes).toBe('unsaved');
      writer.change(value => { value.notes = 'also kept'; });
      expect(save).toHaveBeenCalledTimes(1);
      expect(await writer.flush()).toBe(true);
      expect(writer.getSnapshot()).toMatchObject({ dirty: false, error: '', session: { notes: 'also kept' } });
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it('coalesces a burst of input and repeated flush calls into the same committed result', async () => {
    const save = vi.fn(async (value, revision) => ({ ...value, revision: revision + 1 })); const writer = new SessionWriter(session(), save);
    for (let index = 0; index < 100; index++) writer.change(value => { value.notes = String(index); });
    const first = writer.flush(), second = writer.flush(); expect(first).toBe(second); expect(await first).toBe(true); expect(save).toHaveBeenCalledTimes(1); expect(writer.getSnapshot()).toMatchObject({ dirty: false, session: { notes: '99', revision: 1 } });
  });
});
