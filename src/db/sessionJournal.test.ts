import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, discardDraft, loadData, recoverSessionJournal, saveSession, startSession } from './database';
import type { SessionJournalEntry } from '../lib/sessionJournal';
import { SessionWriter } from '../lib/SessionWriter';

async function recoveredData() { await recoverSessionJournal(); return loadData(); }
const storage = new Map<string, string>();
beforeEach(async () => {
  vi.stubGlobal('localStorage', { get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i], getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal('sessionStorage', { getItem: () => 'test-tab', setItem() {} });
  storage.clear(); await db.delete(); await db.open();
});
afterEach(async () => { await db.delete(); vi.unstubAllGlobals(); });
async function pending() {
  const base = await startSession('A'), latest = structuredClone(base); latest.exercises[0].sets[0].repsText = '14'; latest.exercises[0].sets[0].reps = 14;
  const entry: SessionJournalEntry = { epoch: db.epoch!, owner: 'closed-page', tab: 'other-tab', released: true, base, latest };
  const key = `log:session-journal:v1:${entry.epoch}:${base.id}:closed-page`;
  storage.set(key, JSON.stringify(entry)); return { base, latest, entry, key };
}
it('recovers input whose IndexedDB operation never committed, once only', async () => {
  const { key } = await pending(); const first = await recoveredData();
  expect(first.active?.exercises[0].sets[0].reps).toBe(14); expect(first.active?.revision).toBe(1); expect(storage.has(key)).toBe(false);
  expect((await recoveredData()).active?.revision).toBe(1);
});
it('recovers the newest input after an earlier inflight write committed without acknowledgement', async () => {
  const { base, entry, key } = await pending(); entry.inflight = structuredClone(base); entry.inflight.notes = 'inflight';
  await saveSession({ ...base, ...entry.inflight }, base.revision); storage.set(key, JSON.stringify(entry));
  expect((await recoveredData()).active?.exercises[0].sets[0].reps).toBe(14);
});
it('does not overwrite another tab revision or restore a deleted set', async () => {
  const { base, key } = await pending(); base.exercises[0].sets.shift(); await saveSession(base, base.revision);
  const result = await recoveredData(); expect(result.recoveryError).not.toBe(''); expect(result.active?.exercises[0].sets).toHaveLength(base.exercises[0].sets.length); expect(storage.has(key)).toBe(true);
});
it('ignores other generations and live foreign pages', async () => {
  const { entry, key } = await pending(); entry.released = false; storage.set(key, JSON.stringify(entry));
  expect((await recoveredData()).active?.revision).toBe(0);
  entry.released = true; entry.epoch = 'old'; storage.delete(key); storage.set('log:session-journal:v1:old:test', JSON.stringify(entry));
  expect((await recoveredData()).active?.revision).toBe(0);
});
it('never recreates a discarded session', async () => {
  const { base } = await pending(); await discardDraft(base.id); expect((await recoveredData()).active).toBeUndefined(); expect(await db.sessions.count()).toBe(0);
});
it('does not mistake an unavailable tab identity for the owner of a live page', async () => {
  const { entry, key } = await pending(); entry.released = false; entry.tab = 'storage-unavailable'; storage.set(key, JSON.stringify(entry));
  vi.stubGlobal('sessionStorage', { getItem() { throw new Error('Blocked'); } });
  expect((await recoveredData()).active?.revision).toBe(0);
});
it('retains the journal on transaction failure', async () => {
  const { key } = await pending(); const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const put = vi.spyOn(db.sessions, 'put').mockRejectedValueOnce(new Error('Disk full'));
  try { expect((await recoveredData()).recoveryError).not.toBe(''); expect(storage.has(key)).toBe(true); expect((await db.sessions.toArray())[0].revision).toBe(0); }
  finally { put.mockRestore(); log.mockRestore(); }
});
it('clears a journal only after its exact input is already committed', async () => {
  const { base, latest, key } = await pending(); await saveSession(latest, base.revision);
  expect((await recoveredData()).active?.revision).toBe(1); expect(storage.has(key)).toBe(false);
});
it('keeps input and displays a storage error until IndexedDB commits when the journal quota fails', async () => {
  const base = await startSession('A'); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
  try {
    const writer = new SessionWriter(base, async (value, revision) => { await gate; return saveSession(value, revision); });
    writer.change(value => { value.notes = 'kept'; }); await Promise.resolve();
    expect(writer.getSnapshot()).toMatchObject({ dirty: true, saving: true, session: { notes: 'kept' } });
    expect(writer.getSnapshot().error).toContain('журнал');
    release(); expect(await writer.flush()).toBe(true); expect(writer.getSnapshot()).toMatchObject({ dirty: false, error: '' });
    expect((await db.sessions.get(base.id))?.notes).toBe('kept');
  } finally { set.mockRestore(); log.mockRestore(); }
});
